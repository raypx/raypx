import {
  createComputerTools,
  ComputerToolsError,
  RunResourceUnavailableError,
  type ComputerTools,
  type ExecutionRun,
} from "@raypx/agents/server";
import { DeviceComputerError } from "@raypx/computers/server";
import type {
  ComputersService,
  DeviceComputersRepository,
  DeviceConnectorRegistry,
  DeviceRunGrant,
} from "@raypx/computers/server";
import { createDeviceComputerProvider } from "@raypx/providers/computer";
import { computerSchema } from "@raypx/core/computers";

type Pin = NonNullable<Parameters<typeof createComputerTools>[3]>;
type Queue = NonNullable<Parameters<typeof createComputerTools>[4]>;
function attempt(run: ExecutionRun) {
  return JSON.stringify([run.spaceId, run.id, run.fence, run.attemptId]);
}
/** A selected device is admitted before tool metadata or inference and remains pinned. */
export function withDeviceComputerTools(
  base: ComputerTools,
  repository: DeviceComputersRepository,
  registry: DeviceConnectorRegistry,
  pin: Pin,
  queue: Queue,
  secrets: () => readonly string[],
): ComputerTools {
  const selected = new Map<string, { tools: ComputerTools; grant: DeviceRunGrant }>();
  const forRun = (run: ExecutionRun) => selected.get(attempt(run))?.tools ?? base;
  return {
    definitions: (run) => (run ? forRun(run).definitions(run) : base.definitions()),
    guardInput: (call) => base.guardInput?.(call),
    modelContent: (run, call, output) =>
      forRun(run).modelContent?.(run, call, output) ?? [{ type: "text", text: output }],
    snapshot: (run) => forRun(run).snapshot?.(run),
    restore: (run, snapshot) => forRun(run).restore?.(run, snapshot),
    async initialize(scope, run, signal) {
      let grant: DeviceRunGrant | null;
      try {
        grant = await repository.resolveRun(scope, {
          id: run.id,
          conversationId: run.conversationId,
          memberAccountId: run.memberAccountId,
          computerId: run.computerId,
          startedAt: run.startedAt,
          untrustedInput: run.untrustedInput === true,
          inboundProvenance: run.inboundProvenance,
        });
      } catch {
        throw new RunResourceUnavailableError("COMPUTER_UNAVAILABLE");
      }
      if (!grant) {
        await base.initialize?.(scope, run, signal);
        return;
      }
      const context = {
        spaceId: run.spaceId,
        conversationId: run.conversationId,
        runId: run.id,
        runFence: run.fence,
        requesterAccountId: run.memberAccountId,
        deviceId: grant.deviceId,
        grantId: grant.id,
      };
      try {
        await repository.admit(context);
      } catch (error) {
        if (error instanceof DeviceComputerError && error.code === "DEVICE_OFFLINE")
          throw new RunResourceUnavailableError("COMPUTER_UNAVAILABLE", Date.now() + 5000);
        throw new RunResourceUnavailableError("COMPUTER_UNAVAILABLE");
      }
      let callId = "";
      const ref = { id: grant.id, generation: grant.generation };
      const provider = createDeviceComputerProvider(ref, {
        async validate() {
          try {
            const current = await repository.admit(context);
            if (current.generation !== ref.generation) throw new Error();
          } catch {
            throw new RunResourceUnavailableError("COMPUTER_UNAVAILABLE");
          }
        },
        async request(operation, operationSignal) {
          const operationId = Buffer.from(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(JSON.stringify([run.id, callId, operation.kind])),
            ),
          ).toString("hex");
          return registry.request(context, operationId, operation, operationSignal);
        },
      });
      const computer = computerSchema.parse({
        id: grant.id,
        spaceId: run.spaceId,
        scope: "device",
        agentId: null,
        provider: "device",
        state: "running",
        generation: grant.generation,
        homeRevision: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseFence: 0,
        failureCode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const state = async () => ({ status: "available" as const, computer });
      const lifecycle: ComputersService = {
        get: state,
        start: state,
        stop: state,
        listDirectory: async () => ({ status: "unavailable", code: "FILES_UNAVAILABLE" }),
        readFile: async () => ({ status: "unavailable", code: "FILES_UNAVAILABLE" }),
      };
      const native = createComputerTools(lifecycle, provider, secrets, pin, queue);
      const tools: ComputerTools = {
        ...native,
        execute(callScope, execution, call, callSignal) {
          callId = call.id;
          return native.execute(callScope, execution, call, callSignal);
        },
      };
      selected.set(attempt(run), { tools, grant });
      await tools.initialize?.(scope, run, signal);
    },
    prepare(call, run) {
      const prepared = (run ? forRun(run) : base).prepare(call, run);
      const grant = run ? selected.get(attempt(run))?.grant : undefined;
      if (!grant) return prepared;
      let command: string | undefined;
      if (prepared.name === "computer_run_command") {
        command = JSON.stringify({
          executable: prepared.arguments.executable,
          argv: prepared.arguments.argv,
          cwd: prepared.arguments.cwd,
        });
        if (command.length > 4096) throw new ComputerToolsError("INVALID_ARGUMENTS");
      }
      return {
        ...prepared,
        device: {
          id: grant.deviceId,
          name: grant.name,
          directory: grant.directory,
          ...(command ? { command } : {}),
        },
      };
    },
    execute: (scope, run, call, signal) => forRun(run).execute(scope, run, call, signal),
    withDriver: (scope, run, call, signal, operation) =>
      forRun(run).withDriver?.(scope, run, call, signal, operation) ?? operation(),
    async cancel(scope, run) {
      const prefix = JSON.stringify([run.spaceId, run.id]).slice(0, -1) + ",";
      const attempts = [...selected.entries()].filter(([key]) => key.startsWith(prefix));
      if (!attempts.length) {
        await base.cancel(scope, run);
        return;
      }
      await Promise.all(attempts.map(([, entry]) => entry.tools.cancel(scope, run)));
    },
    release(run) {
      const entry = selected.get(attempt(run));
      if (entry) {
        entry.tools.release(run);
        selected.delete(attempt(run));
      } else base.release(run);
    },
  };
}
