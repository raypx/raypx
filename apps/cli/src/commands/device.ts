import { createInterface } from "node:readline/promises";
import { defineCommand, type CommandDef } from "citty";
import { z } from "zod";
import { globalArgs, type CliArgs } from "./args.js";
import { devicePrompt } from "./device-messages.js";
import { LocalError } from "../runtime/errors.js";
import type { ConnectorProfileOptions } from "../runtime/device-connector/storage.js";

const command = (definition: CommandDef) => defineCommand(definition);

/** Server Agent state never enters the retained local execution owner. */
export function createDeviceCommands(invocation: CliArgs, options: ConnectorProfileOptions) {
  const descriptions = {
    pair: "Pair this device with a short-lived Space code",
    grant: "Confirm one Space directory grant on this device",
    grants: "List this device's locally confirmed Space directory grants",
    "revoke-grant": "Revoke a Space directory grant and stop active work",
    revoke: "Revoke this device and stop active work",
    start: "Start the outbound-only device connector",
    run: "Run the outbound-only device connector in the foreground",
    status: "Read this device connector's local status",
    stop: "Stop this profile's device connector and cancel its work",
    native: "Private finite native device confirmation",
  };
  const leaves = new Map<string, CommandDef>();
  for (const [action, description] of Object.entries(descriptions)) {
    const definition: CommandDef = {
      meta: { name: `device ${action}`, description, hidden: action === "native" },
      args: { ...globalArgs, input: { type: "positional", required: false } },
      async run({ args }) {
        if (args._.length > 1)
          throw new LocalError("INVALID_INPUT", "Device commands accept one JSON input");
        const actions = await import("../runtime/device-connector/actions.js");
        const { ConnectorStorage } = await import("../runtime/device-connector/storage.js");
        if (action === "native") {
          if (args._.length || invocation.yes || !invocation.json)
            throw new LocalError(
              "INVALID_INPUT",
              "Native confirmation requires bounded stdin JSON",
            );
          let bytes = 0;
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) {
            const part = Buffer.from(chunk);
            bytes += part.length;
            if (bytes > 16 * 1024)
              throw new LocalError("INVALID_INPUT", "Native confirmation input is too large");
            chunks.push(part);
          }
          console.log(
            JSON.stringify(
              await actions.nativeDeviceAction(
                options,
                JSON.parse(Buffer.concat(chunks).toString("utf8")),
              ),
            ),
          );
          return;
        }
        if (action === "run") {
          if (args._.length || invocation.json || invocation.yes)
            throw new LocalError(
              "INVALID_INPUT",
              "Device run does not accept operands, --json or --yes",
            );
          await (
            await import("../runtime/device-connector/connection.js")
          ).runDeviceConnector(options);
          return;
        }
        const storage = new ConnectorStorage(options);
        let result: unknown;
        if (action === "pair" || action === "grant") {
          if (invocation.json || invocation.yes || !process.stdin.isTTY || !process.stderr.isTTY)
            throw new LocalError(
              "INTERACTIVE_REQUIRED",
              "Pairing and every directory grant require confirmation on this device",
            );
          const prompt = createInterface({ input: process.stdin, output: process.stderr });
          try {
            if (action === "pair") {
              const raw = args._[0]
                ? (JSON.parse(args._[0]) as unknown)
                : {
                    serverOrigin: await prompt.question(devicePrompt("serverOrigin")),
                    code: await prompt.question(devicePrompt("pairingCode")),
                  };
              const input = z
                .strictObject({ serverOrigin: z.string(), code: z.string() })
                .parse(raw);
              const prepared = await actions.prepareDevicePairing(
                storage,
                input.serverOrigin,
                input.code,
              );
              const answer = await prompt.question(
                devicePrompt("confirmPair", {
                  space: JSON.stringify(prepared.spaceLabel),
                  account: JSON.stringify(prepared.accountLabel),
                  origin: prepared.serverOrigin,
                }),
              );
              if (answer !== "yes")
                throw new LocalError("CONFIRMATION_REQUIRED", "Device pairing was not confirmed");
              result = await actions.confirmDevicePairing(storage, prepared.confirmationId);
              await actions.startDeviceConnector(options);
            } else {
              const input = z
                .strictObject({
                  serverOrigin: z.string().optional(),
                  spaceId: z.string(),
                  deviceId: z.string().optional(),
                  path: z.string().optional(),
                })
                .parse(JSON.parse(args._[0] ?? "{}"));
              const binding = storage.read().binding;
              if (!binding) throw new LocalError("CONNECTOR_NOT_PAIRED", "Pair this device first");
              const path = input.path ?? (await prompt.question(devicePrompt("directory")));
              const prepared = await actions.prepareDeviceGrant(
                storage,
                input.serverOrigin ?? binding.serverOrigin,
                input.spaceId,
                input.deviceId ?? binding.deviceId,
                path,
              );
              const answer = await prompt.question(
                devicePrompt("confirmGrant", {
                  space: JSON.stringify(prepared.spaceLabel),
                  account: JSON.stringify(prepared.accountLabel),
                  origin: prepared.serverOrigin,
                  directory: JSON.stringify(prepared.path),
                }),
              );
              if (answer !== "yes")
                throw new LocalError("CONFIRMATION_REQUIRED", "Directory grant was not confirmed");
              result = await actions.confirmDeviceGrant(storage, prepared.confirmationId);
            }
          } finally {
            prompt.close();
          }
        } else if (action === "revoke-grant") {
          const input = z
            .strictObject({ grantId: z.string().min(1).max(200) })
            .parse(JSON.parse(args._[0] ?? "{}"));
          result = await actions.revokeDeviceGrant(storage, input.grantId);
        } else {
          if (args._.length)
            throw new LocalError("INVALID_INPUT", "Device command does not accept operands");
          if (action === "start") result = await actions.startDeviceConnector(options);
          if (action === "stop") result = await actions.stopDeviceConnector(storage);
          if (action === "status") result = actions.deviceConnectorStatus(storage);
          if (action === "grants") result = actions.deviceConnectorStatus(storage).grants;
          if (action === "revoke") result = await actions.revokeDeviceConnector(storage);
        }
        console.log(JSON.stringify(result, null, invocation.json ? undefined : 2));
      },
    };
    leaves.set(action, defineCommand(definition));
  }
  return {
    leaves,
    command: command({
      meta: { name: "device", description: "Space device computer connector" },
      args: globalArgs,
      subCommands: Object.fromEntries(leaves),
    }),
  };
}
