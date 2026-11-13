import {
  ComputerError,
  MAX_HOME_BYTES,
  bound,
  commandSchema,
  computerRefSchema,
  validateHome,
  workspacePath,
  type ComputerProvider,
  type ComputerRef,
  type ProcessEvent,
} from "@raypx/providers/computer";
import type { SandboxConfig } from "./config.js";
import type { Engine } from "./engine.js";
import { publicComputer, type ComputerStore, type StoredComputer } from "./store.js";

export function createSupervisor(
  config: SandboxConfig,
  engine: Engine,
  store: ComputerStore,
): ComputerProvider {
  const locks = new Map<string, Promise<unknown>>();
  const active = new Map<string, Set<{ cancel(): Promise<void>; done: Promise<void> }>>();
  let network: Promise<void> | undefined;
  function locked<T>(ref: ComputerRef, operation: () => Promise<T>): Promise<T> {
    computerRefSchema.parse(ref);
    const task = (locks.get(ref.id) ?? Promise.resolve()).catch(() => {}).then(operation);
    locks.set(ref.id, task);
    void task
      .finally(() => {
        if (locks.get(ref.id) === task) locks.delete(ref.id);
      })
      .catch(() => {});
    return task;
  }
  async function current(ref: ComputerRef, running = false) {
    const c = await store.read(ref.id);
    if (!c) throw new ComputerError("NOT_FOUND");
    if (c.generation !== ref.generation) throw new ComputerError("STALE_GENERATION");
    if (running && c.state !== "running") throw new ComputerError("NOT_RUNNING");
    return c;
  }
  function ensureNetwork() {
    return (network ??= (async () => {
      const networks = await engine.json<{ Name: string; Id: string }[]>("/networks");
      const existing = networks.find((n) => n.Name === config.network);
      if (existing) {
        const value = await engine.json<{
          Driver: string;
          Options: Record<string, string>;
          Labels: Record<string, string>;
        }>(`/networks/${existing.Id}`);
        if (
          value.Driver !== "bridge" ||
          value.Options["com.docker.network.bridge.name"] !== config.bridge ||
          value.Labels["raypx.supervisor"] !== config.network
        )
          throw new ComputerError("PROVIDER_UNAVAILABLE");
        return;
      }
      await engine.response("/networks/create", "POST", {
        Name: config.network,
        Driver: "bridge",
        Internal: false,
        Options: {
          "com.docker.network.bridge.name": config.bridge,
          "com.docker.network.bridge.enable_icc": "false",
        },
        Labels: { "raypx.supervisor": config.network },
      });
    })().catch((error) => {
      network = undefined;
      throw error;
    }));
  }
  async function create(c: StoredComputer) {
    await ensureNetwork();
    const volume = `rpx-${c.id}-${c.generation}-${crypto.randomUUID()}`;
    await engine.response("/volumes/create", "POST", {
      Name: volume,
      Labels: { "raypx.computer": c.id, "raypx.supervisor": config.network },
    });
    let container: string | undefined;
    try {
      const result = await engine.json<{ Id: string }>("/containers/create", "POST", {
        Image: config.image,
        User: "1000:1000",
        WorkingDir: "/home/computer/workspace",
        Env: ["HOME=/home/computer", "PATH=/usr/local/bin:/usr/bin:/bin"],
        Cmd: ["sleep", "infinity"],
        Labels: {
          "raypx.computer": c.id,
          "raypx.generation": String(c.generation),
          "raypx.supervisor": config.network,
        },
        HostConfig: {
          Memory: config.memory,
          MemorySwap: config.memory,
          NanoCpus: config.nanoCpus,
          PidsLimit: config.pids,
          Privileged: false,
          ReadonlyRootfs: true,
          CapDrop: ["ALL"],
          SecurityOpt: ["no-new-privileges:true"],
          NetworkMode: config.network,
          Init: true,
          Tmpfs: { "/tmp": "rw,nosuid,nodev,noexec,size=67108864,mode=1777" },
          Mounts: [{ Type: "volume", Source: volume, Target: "/home/computer" }],
          LogConfig: { Type: "none" },
        },
      });
      container = result.Id;
      await engine.response(`/containers/${container}/start`, "POST");
      return { ...c, container, volume, state: "running" as "running" | "stopped" };
    } catch (error) {
      if (container)
        await engine.response(`/containers/${container}?force=true`, "DELETE").catch(() => {});
      await engine.response(`/volumes/${volume}`, "DELETE").catch(() => {});
      throw error;
    }
  }
  async function remove(c: StoredComputer) {
    if (c.container)
      await engine.response(`/containers/${c.container}?force=true`, "DELETE", undefined, [404]);
    if (c.volume) await engine.response(`/volumes/${c.volume}`, "DELETE", undefined, [404]);
  }
  async function cancelAll(id: string) {
    const processes = [...(active.get(id) ?? [])];
    await Promise.all(processes.map((p) => p.cancel()));
    await Promise.all(processes.map((p) => p.done));
  }
  async function snapshotCurrent(c: StoredComputer) {
    if (!c.container || c.state !== "running") {
      if (c.homeRevision) return { revision: c.homeRevision };
      throw new ComputerError("NOT_RUNNING");
    }
    await cancelAll(c.id);
    const validated = await validateHome(await engine.helper(c.container, "export"));
    await store.saveHome(c.id, validated.revision, validated.archive);
    c.homeRevision = validated.revision;
    await store.write(c);
    return { revision: validated.revision };
  }
  return {
    async describe() {
      const restricted = config.restrictedEgress && config.hostRulesApplied;
      return {
        execution: "isolated-process",
        files: true,
        home: true,
        egress: restricted ? "restricted" : "unrestricted",
        unenforced: restricted
          ? [
              "Host firewall rules are an operator assertion; the supervisor cannot verify them",
              "No home disk quota; home archives reject special files and cap regular file bytes at 32 MiB",
              "Cancellation covers a process group; detached descendants require container stop/destroy",
            ]
          : [
              "Network egress to host, LAN and metadata is not restricted without the host ruleset",
              "No home disk quota; home archives reject special files and cap regular file bytes at 32 MiB",
              "Cancellation covers a process group; detached descendants require container stop/destroy",
            ],
      };
    },
    get: (ref) => locked(ref, async () => publicComputer(await current(ref))),
    provision: (ref) =>
      locked(ref, async () => {
        let c = await store.read(ref.id);
        if (c && c.generation > ref.generation) throw new ComputerError("STALE_GENERATION");
        if (c && c.generation === ref.generation) {
          if (c.state === "destroyed") throw new ComputerError("NOT_RUNNING");
          if (c.container) {
            const live = await engine.json<{ State: { Running: boolean } }>(
              `/containers/${c.container}/json`,
            );
            if (!live.State.Running)
              await engine.response(`/containers/${c.container}/start`, "POST");
            c.state = "running";
            await store.write(c);
            return publicComputer(c);
          }
        }
        const old = c;
        c = {
          ...ref,
          state: "stopped",
          container: null,
          volume: null,
          homeRevision: old?.homeRevision ?? null,
        };
        // Persist the fence before any replacement I/O. Failures can never re-admit an old writer.
        await store.write(c);
        if (old?.container) {
          await cancelAll(ref.id);
          await remove(old);
        }
        let candidate: StoredComputer | undefined;
        try {
          candidate = await create(c);
          if (c.homeRevision) {
            const validated = await validateHome(await store.home(c.id, c.homeRevision));
            if (validated.revision !== c.homeRevision) throw new ComputerError("RESTORE_FAILED");
            await engine.helper(candidate.container!, "import", { archive: validated.archive });
            const restored = await validateHome(
              await engine.helper(candidate.container!, "export"),
            );
            if (restored.revision !== validated.revision) throw new ComputerError("RESTORE_FAILED");
          }
          await store.write(candidate);
          return publicComputer(candidate);
        } catch (error) {
          if (candidate) await remove(candidate).catch(() => {});
          if (c.homeRevision) throw new ComputerError("RESTORE_FAILED");
          throw error;
        }
      }),
    stop: (ref) =>
      locked(ref, async () => {
        const c = await current(ref);
        if (c.state !== "running") return publicComputer(c);
        await snapshotCurrent(c);
        await engine.response(`/containers/${c.container}/stop?t=10`, "POST");
        c.state = "stopped";
        await store.write(c);
        return publicComputer(c);
      }),
    destroy: (ref) =>
      locked(ref, async () => {
        const c = await current(ref);
        if (c.state === "destroyed") return publicComputer(c);
        await cancelAll(ref.id);
        await remove(c);
        c.container = null;
        c.volume = null;
        c.state = "destroyed";
        await store.write(c);
        return publicComputer(c);
      }),
    execute: (ref, input) =>
      locked(ref, async () => {
        const c = await current(ref, true);
        const command = commandSchema.parse(input);
        const cwd = workspacePath(command.cwd);
        const executionId = crypto.randomUUID();
        // Wrapper establishes a cancellable process group without shell interpolation.
        const exec = await engine.startHelper(c.container!, "exec", {
          ...command,
          cwd,
          executionId,
        });
        let cancelled = false;
        let done!: () => void;
        const completion = new Promise<void>((resolve) => {
          done = resolve;
        });
        const process = {
          done: completion,
          cancel: async () => {
            cancelled = true;
            await engine.helper(c.container!, "cancel", { executionId });
          },
        };
        const processes = active.get(ref.id) ?? new Set();
        active.set(ref.id, processes);
        processes.add(process);
        // Only the byte budget plus one exit can enter this queue; draining is independent of the HTTP reader.
        const stream = new ReadableStream<ProcessEvent>({
          start(controller) {
            void (async () => {
              let emitted = 0;
              let truncated = false;
              try {
                for await (const event of engine.output(exec.body)) {
                  const bytes = Buffer.from(event.bytes, "base64");
                  const allowed = Math.max(0, command.outputBudget - emitted);
                  if (bytes.length > allowed) truncated = true;
                  if (allowed > 0) {
                    const part = bytes.subarray(0, allowed);
                    emitted += part.length;
                    controller.enqueue({ kind: event.kind, bytes: part.toString("base64") });
                  }
                }
                const exit = await engine.json<{ ExitCode: number }>(`/exec/${exec.id}/json`);
                controller.enqueue({ kind: "exit", status: exit.ExitCode, cancelled, truncated });
                controller.close();
              } catch {
                controller.error(new ComputerError("PROVIDER_UNAVAILABLE"));
              } finally {
                processes.delete(process);
                done();
              }
            })();
          },
          cancel: () => process.cancel(),
        });
        const reader = stream.getReader();
        async function* events(): AsyncIterable<ProcessEvent> {
          try {
            while (true) {
              const { value, done: ended } = await reader.read();
              if (ended) return;
              yield value;
            }
          } finally {
            await reader.cancel();
          }
        }
        return { events: events(), cancel: process.cancel };
      }),
    list: (ref, path, limit) =>
      locked(ref, async () => {
        const c = await current(ref, true);
        return engine.helper(c.container!, "list", {
          path: workspacePath(path),
          limit: bound(limit, 1000),
        });
      }),
    read: (ref, path, maxBytes) =>
      locked(ref, async () => {
        const c = await current(ref, true);
        return engine.helper(c.container!, "read", {
          path: workspacePath(path),
          maxBytes: bound(maxBytes, MAX_HOME_BYTES),
        });
      }),
    write: (ref, path, bytes) =>
      locked(ref, async () => {
        const c = await current(ref, true);
        if (Buffer.from(bytes, "base64").length > MAX_HOME_BYTES)
          throw new ComputerError("LIMIT_EXCEEDED");
        await engine.helper(c.container!, "write", { path: workspacePath(path), bytes });
      }),
    exportHome: (ref) =>
      locked(ref, async () => {
        const c = await current(ref);
        if (c.state !== "running") {
          if (c.homeRevision) return store.home(c.id, c.homeRevision);
          throw new ComputerError("NOT_RUNNING");
        }
        await cancelAll(ref.id);
        return (await validateHome(await engine.helper(c.container!, "export"))).archive;
      }),
    importHome: (ref, input) =>
      locked(ref, async () => {
        const c = await current(ref);
        if (c.state === "destroyed") throw new ComputerError("NOT_RUNNING");
        const validated = await validateHome(input);
        await cancelAll(ref.id);
        const candidate = await create(c);
        try {
          await engine.helper(candidate.container, "import", { archive: validated.archive });
          const restored = await validateHome(await engine.helper(candidate.container, "export"));
          if (restored.revision !== validated.revision) throw new ComputerError("RESTORE_FAILED");
          await store.saveHome(c.id, validated.revision, validated.archive);
          if (c.container) await engine.response(`/containers/${c.container}/stop?t=10`, "POST");
          if (c.state === "stopped") {
            await engine.response(`/containers/${candidate.container}/stop?t=10`, "POST");
            candidate.state = "stopped";
          }
          candidate.homeRevision = validated.revision;
          await store.write(candidate);
        } catch {
          await remove(candidate).catch(() => {});
          throw new ComputerError("RESTORE_FAILED");
        }
        if (c.container) await remove(c);
        return { revision: validated.revision };
      }),
    snapshot: (ref) => locked(ref, async () => snapshotCurrent(await current(ref))),
  };
}
