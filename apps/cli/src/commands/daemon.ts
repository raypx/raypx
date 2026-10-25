import { defineCommand, type CommandDef } from "citty";
import { globalArgs, type CliArgs } from "./args";
import { LocalError } from "../runtime/errors";
import { profilePath } from "../runtime/state";
import { connectDaemon, stopDaemon, type ProfileOptions } from "../runtime/daemon/endpoint";

const command = (definition: CommandDef) => defineCommand(definition);
function group(
  name: string,
  actions: Record<string, string>,
  run: (action: string, inputs: string[]) => Promise<void>,
) {
  const leaves = new Map<string, CommandDef>();
  for (const [action, description] of Object.entries(actions))
    leaves.set(
      action,
      command({
        meta: { name: `${name} ${action}`, description },
        args: { ...globalArgs, input: { type: "positional", required: false } },
        run: ({ args }) => run(action, args._),
      }),
    );
  return {
    leaves,
    command: command({
      meta: { name, description: `Raypx ${name}` },
      args: globalArgs,
      subCommands: Object.fromEntries(leaves),
    }),
  };
}
export function createDaemonCommands(invocation: CliArgs, options: ProfileOptions) {
  return group(
    "daemon",
    {
      start: "Start the independent execution host",
      run: "Run the host in the foreground",
      status: "Read host status",
      stop: "Stop the host and cancel managed work",
      restart: "Stop the previous host, cancel managed work and start this version",
      proxy: "Private Desktop client transport",
      install: "Install the macOS user service",
      uninstall: "Remove the macOS user service",
    },
    async (action, inputs) => {
      if (inputs.length)
        throw new LocalError("INVALID_INPUT", "Daemon commands do not accept operands");
      if (action === "run" || action === "proxy") {
        if (invocation.json || invocation.yes)
          throw new LocalError("INVALID_INPUT", "Daemon transports do not accept --json or --yes");
        if (action === "run") await (await import("../runtime/daemon/server")).runDaemon(options);
        else await (await import("../transport/daemon-stdio")).serveDaemonStdio(options);
        return;
      }
      let result: unknown;
      if (action === "install" || action === "uninstall")
        result = await (
          await import("../runtime/daemon/service")
        ).configureService(options, action);
      else {
        try {
          if (action === "stop") result = await stopDaemon(options);
          else {
            if (action === "restart") {
              try {
                await stopDaemon(options);
              } catch (error) {
                if (!(error instanceof LocalError) || error.code !== "HOST_NOT_RUNNING")
                  throw error;
              }
            }
            const endpoint = await connectDaemon(
              options,
              action === "start" || action === "restart",
              action === "status" ? "any" : "match",
            );
            result = { running: true, version: endpoint.version };
          }
        } catch (error) {
          if (error instanceof LocalError && error.code === "HOST_NOT_RUNNING")
            result = { running: false };
          else throw error;
        }
      }
      console.log(JSON.stringify(result, null, invocation.json ? undefined : 2));
    },
  );
}
export function createConnectorCommands(invocation: CliArgs, options: ProfileOptions) {
  return group(
    "connectors",
    {
      status: "Read installed terminal hooks",
      install: "Install a Claude or Codex hook",
      uninstall: "Remove only the owned Agent hook",
      hook: "Private fail-open Agent hook",
    },
    async (action, inputs) => {
      const provider = inputs[0];
      if (action === "hook") {
        try {
          if (inputs.length !== 1 || (provider !== "claude" && provider !== "codex")) return;
          let raw = "";
          const decoder = new TextDecoder();
          for await (const chunk of process.stdin) {
            raw += decoder.decode(chunk, { stream: true });
            if (Buffer.byteLength(raw) > 256 * 1024) return;
          }
          const { forwardTerminalHook } = await import("../runtime/terminal/hook");
          const result = await forwardTerminalHook(profilePath(options), provider, JSON.parse(raw));
          if (result) {
            await new Promise<void>((resolve, reject) =>
              process.stdout.write(JSON.stringify(result.output) + "\n", (error) =>
                error ? reject(error) : resolve(),
              ),
            );
            await result.delivered();
          }
        } catch {
          /* Every hook failure returns the Agent's native permission flow. */
        }
        return;
      }
      const { connectorAction, connectorStatus } = await import("../runtime/daemon/connectors");
      if (action === "status") {
        if (inputs.length)
          throw new LocalError("INVALID_INPUT", "Connector status does not accept operands");
        console.log(
          JSON.stringify(
            await connectorStatus(profilePath(options)),
            null,
            invocation.json ? undefined : 2,
          ),
        );
        return;
      }
      if (inputs.length !== 1 || (provider !== "claude" && provider !== "codex"))
        throw new LocalError("INVALID_PROVIDER", "Select claude or codex");
      console.log(
        JSON.stringify(
          await connectorAction(
            profilePath(options),
            provider,
            action === "install" ? "install" : "uninstall",
          ),
          null,
          invocation.json ? undefined : 2,
        ),
      );
    },
  );
}
