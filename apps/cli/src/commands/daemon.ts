import { defineCommand, type CommandDef } from "citty";
import { globalArgs, type CliArgs } from "./args.js";
import { LocalError } from "../runtime/errors.js";
import { connectDaemon, stopDaemon, type ProfileOptions } from "../runtime/daemon/endpoint.js";

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
      start: "Start the independent Desktop session transport",
      run: "Run the host in the foreground",
      status: "Read host status",
      stop: "Stop the host and close Desktop sessions",
      restart: "Stop the previous host, close Desktop sessions and start this version",
      desktop: "Private finite Desktop bootstrap",
    },
    async (action, inputs) => {
      if (inputs.length)
        throw new LocalError("INVALID_INPUT", "Daemon commands do not accept operands");
      if (action === "desktop") {
        await (await import("../transport/desktop.js")).bootstrapDesktop(options);
        return;
      }
      if (action === "run") {
        if (invocation.json)
          throw new LocalError("INVALID_INPUT", "Daemon transports do not accept --json");
        await (await import("../runtime/daemon/server.js")).runDaemon(options);
        return;
      }
      let result: unknown;
      {
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
