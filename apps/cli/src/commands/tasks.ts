import { defineCommand, type CommandDef } from "citty";
import { z } from "zod";
import { LOCAL_WORKSPACE_ID, localParams } from "@raypx/contracts/local";
import { relayRequestSchema } from "@raypx/contracts/tasks";
import { globalArgs, type CliArgs } from "./args.js";
import { LocalError } from "../runtime/errors.js";
import { createDaemonClient } from "../transport/daemon-client.js";
import type { ProfileOptions } from "../runtime/daemon/endpoint.js";

function object(source?: string): Record<string, unknown> {
  try {
    return z.record(z.string(), z.unknown()).parse(JSON.parse(source ?? "{}"));
  } catch {
    throw new LocalError("INVALID_INPUT", "Task commands accept one JSON object");
  }
}
const owner = { accountId: LOCAL_WORKSPACE_ID } as const;
function taskCommand(definition: CommandDef) {
  return defineCommand(definition);
}
const taskId = z.object({ id: z.uuid() });
// Relay commands; the only other relay action is "approvals decide".
const relayMethods = new Map([
  ["create", "tasks.create"],
  ["follow-up", "tasks.followUp"],
  ["input", "tasks.input"],
  ["cancel", "tasks.cancel"],
]);
export function createTaskCommands(invocation: CliArgs, options: ProfileOptions) {
  const leaves = new Map<string, CommandDef>();
  const descriptions = {
    providers: "Inspect provider capabilities",
    models: "List configured Pi models",
    projects: "List granted Agent projects",
    configure: "Enable providers for an already granted root",
    create: "Start a background Agent task",
    "follow-up": "Continue a finished task",
    input: "Queue or steer an active task",
    list: "List local Agent tasks",
    get: "Read a task and its approvals",
    cancel: "Cancel and drain an Agent task",
    watch: "Watch authoritative task snapshots as NDJSON",
    "approvals list": "List pending Agent approvals",
    "approvals get": "Inspect one Agent approval",
    "approvals decide": "Apply one explicit Agent decision",
    "defaults get": "Read the device model default",
    "defaults set": "Set the device model default",
  };
  for (const [action, description] of Object.entries(descriptions))
    leaves.set(
      action,
      taskCommand({
        meta: { name: "tasks " + action, description },
        args: {
          ...globalArgs,
          input: { type: "positional", description: "JSON params", required: false },
        },
        async run({ args }) {
          if (args._.length > 1) throw new LocalError("INVALID_INPUT", "Expected one JSON object");
          if (invocation.yes)
            throw new LocalError(
              "INVALID_INPUT",
              "Task decisions must be explicit JSON; --yes is unsupported",
            );
          const params = object(args._[0]);
          if (action === "watch") {
            await watchTask(options, taskId.parse(params).id);
            return;
          }
          const client = await createDaemonClient(options);
          const stop = () => {
            void client.close();
          };
          process.once("SIGINT", stop);
          process.once("SIGTERM", stop);
          try {
            const request = client.request;
            let result: unknown;
            if (action === "providers")
              result = await request(
                "agents.capabilities",
                localParams["agents.capabilities"].parse(params),
              );
            else if (action === "models")
              result = await request(
                "agents.models.list",
                localParams["agents.models.list"].parse(params),
              );
            else if (action === "projects")
              result = await request(
                "agents.projects",
                localParams["agents.projects"].parse(params),
              );
            else if (action === "configure")
              result = await request(
                "agents.configure",
                localParams["agents.configure"].parse(params),
              );
            else if (action === "defaults get")
              result = await request(
                "agents.models.default",
                localParams["agents.models.default"].parse(params),
              );
            else if (action === "defaults set")
              result = await request(
                "agents.models.setDefault",
                localParams["agents.models.setDefault"].parse(params),
              );
            else if (action === "list")
              result = await request("agents.local.list", { ...params, ...owner });
            else if (action === "get")
              result = await request("agents.local.get", {
                ...params,
                ...owner,
                id: taskId.parse(params).id,
              });
            else if (action === "approvals list")
              result = await request("agents.local.approvals", owner);
            else if (action === "approvals get") {
              const id = taskId.parse(params).id;
              const task = params.taskId;
              if (typeof task !== "string")
                throw new LocalError("INVALID_INPUT", "Approval get requires id and taskId");
              result = (await request("agents.local.get", { ...owner, id: task })).requests.find(
                (entry) => entry.id === id,
              );
              if (!result) throw new LocalError("NOT_FOUND", "Approval unavailable");
            } else {
              const method = relayMethods.get(action) ?? "approvals.decide";
              const commandId =
                typeof params.commandId === "string"
                  ? z.uuid().parse(params.commandId)
                  : ["create", "follow-up", "input"].includes(action) &&
                      typeof params.id === "string"
                    ? z.uuid().parse(params.id)
                    : crypto.randomUUID();
              const { commandId: _commandId, ...payload } = params;
              const input = {
                ...payload,
                ...(["create", "follow-up", "input"].includes(action) ? { id: commandId } : {}),
                ...(action === "create"
                  ? { deviceId: (await request("agents.local.device", owner)).id }
                  : {}),
              };
              const operation = relayRequestSchema.parse({ method, input });
              const receipt = await request("agents.local.execute", {
                ...owner,
                id: commandId,
                request: operation,
              }).catch((error: unknown) => {
                if (
                  error instanceof LocalError &&
                  !["HOST_UNAVAILABLE", "TOO_LARGE", "INVALID_FRAME"].includes(error.code)
                )
                  throw error;
                throw new LocalError(
                  "TASK_DELIVERY_UNCERTAIN",
                  "Inspect or retry command ID: " + commandId,
                );
              });
              if (!receipt.ok)
                throw new LocalError(receipt.code, "Task command failed: " + commandId);
              result = { commandId, value: receipt.value };
            }
            console.log(JSON.stringify(result, null, invocation.json ? undefined : 2));
          } finally {
            await client.close();
            process.off("SIGINT", stop);
            process.off("SIGTERM", stop);
          }
        },
      }),
    );
  const groups: Record<string, CommandDef> = {};
  for (const parent of ["approvals", "defaults"]) {
    groups[parent] = taskCommand({
      meta: { name: "tasks " + parent },
      args: globalArgs,
      subCommands: Object.fromEntries(
        [...leaves]
          .filter(([name]) => name.startsWith(parent + " "))
          .map(([name, leaf]) => [name.slice(parent.length + 1), leaf]),
      ),
    });
    leaves.set(parent, groups[parent]);
  }
  return {
    leaves,
    command: taskCommand({
      meta: { name: "tasks", description: "Background Agent tasks owned by the daemon" },
      args: globalArgs,
      subCommands: {
        ...Object.fromEntries([...leaves].filter(([name]) => !name.includes(" "))),
        ...groups,
      },
    }),
  };
}
async function watchTask(options: ProfileOptions, id: string) {
  const watchController = new AbortController();
  let client: Awaited<ReturnType<typeof createDaemonClient>> | undefined;
  const stop = () => {
    watchController.abort();
    void client?.close();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let previous = "",
    attempts = 0,
    dirty = true,
    refreshedAt = 0;
  try {
    while (!watchController.signal.aborted) {
      try {
        if (!client) {
          client = await createDaemonClient(options, attempts === 0);
          client.subscribe((event) => {
            if (event.event === "agent.changed" || event.event === "engine.status") dirty = true;
          });
          dirty = true;
        }
        if (!dirty && Date.now() - refreshedAt < 5000) {
          await Bun.sleep(100);
          continue;
        }
        dirty = false;
        const detail = await client.request("agents.local.get", { ...owner, id });
        const current = JSON.stringify(detail);
        if (current !== previous) {
          console.log(JSON.stringify({ type: "snapshot", data: detail }));
          previous = current;
        }
        attempts = 0;
        refreshedAt = Date.now();
        await Bun.sleep(100);
      } catch (error) {
        if (watchController.signal.aborted) break;
        await client?.close();
        client = undefined;
        if (error instanceof LocalError && error.code === "NOT_FOUND") throw error;
        attempts++;
        console.log(JSON.stringify({ type: "connection", status: "reconnecting" }));
        await Bun.sleep(Math.min(1000 * attempts, 5000));
      }
    }
  } finally {
    await client?.close();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}
