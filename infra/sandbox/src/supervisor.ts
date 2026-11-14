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
import { hostNetwork, type NetworkPolicy } from "./network.js";
import {
  MAX_COMPUTER_SCREEN_BYTES,
  MAX_COMPUTER_SCREEN_FPS,
  computerScreenAvailabilitySchema,
  computerScreenFrameSchema,
  computerScreenInputSchema,
  type ComputerScreenFrame,
} from "@raypx/core/computers";
import { publicComputer, type ComputerStore, type StoredComputer } from "./store.js";
import {
  exportStoppedHome,
  measureStorage,
  prepareResolver,
  verifyRuntime,
  verifyWriteAccounting,
  writtenBytes,
} from "./hosting.js";

export function createSupervisor(
  config: SandboxConfig,
  engine: Engine,
  store: ComputerStore,
  hostingOptions: {
    now?: () => number;
    usage?: typeof measureStorage;
    report?: (value: object) => void;
    network?: NetworkPolicy;
  } = {},
): ComputerProvider & {
  initialize(): Promise<void>;
  maintain(): Promise<void>;
  maintainNetwork(): Promise<void>;
} {
  const networkPolicy = config.networkLimits
    ? (hostingOptions.network ?? hostNetwork(config))
    : undefined;
  engine.configureCommandLimits({
    files: 1024,
    fileBytes: config.homeBytes,
    pids: config.runtime === "runsc" ? config.pids : null,
  });
  const now = hostingOptions.now ?? Date.now;
  const usage = hostingOptions.usage ?? measureStorage;
  const report =
    hostingOptions.report ??
    ((value: object) =>
      console.log(JSON.stringify({ timestamp: new Date(now()).toISOString(), ...value })));
  let accountingHealthy = true;
  let admission = Promise.resolve<unknown>(undefined);
  function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const task = admission.catch(() => {}).then(operation);
    admission = task;
    return task;
  }
  const locks = new Map<string, Promise<unknown>>();
  const auxiliary = new Set<string>();
  const active = new Map<string, Set<{ cancel(): Promise<void>; done: Promise<void> }>>();
  const screenFailures = new Map<string, number>();
  const screenEpochs = new Map<string, number>();
  const frameSequences = new Map<string, number>();
  let graphicalAvailable = config.graphical === true;
  let graphicalReason: "GRAPHICAL_IMAGE_NOT_CONFIGURED" | "GRAPHICAL_RUNTIME_UNAVAILABLE" =
    "GRAPHICAL_IMAGE_NOT_CONFIGURED";
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
    if (running) {
      if (networkPolicy && !c.networkKey) throw new ComputerError("CAPACITY_UNAVAILABLE");
      if (now() - c.startedAt >= config.lifetimeMs) {
        await forceStop(c, "lifetime");
        throw new ComputerError("NOT_RUNNING");
      }
      c.lastActiveAt = now();
      await store.write(c);
    }
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
          value.Labels["raypx.supervisor"] !== config.network ||
          value.Options["com.docker.network.bridge.enable_icc"] !== "false"
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
    const inputVolume = `${volume}-input`;
    let container: string | undefined;
    const networkKey = crypto.randomUUID();
    try {
      await engine.response("/volumes/create", "POST", {
        Name: volume,
        Labels: { "raypx.computer": c.id, "raypx.supervisor": config.network },
      });
      await engine.response("/volumes/create", "POST", {
        Name: inputVolume,
        Labels: { "raypx.computer": c.id, "raypx.supervisor": config.network },
      });
      if (config.runtime === "runsc") await prepareResolver(config, engine, inputVolume, auxiliary);
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
          "raypx.space": c.spaceId,
          "raypx.role": "computer",
          "raypx.network-key": networkKey,
        },
        HostConfig: {
          Runtime: config.runtime,
          Memory: config.memory,
          MemorySwap: config.memory,
          NanoCpus: config.nanoCpus,
          PidsLimit: config.hostPids,
          Privileged: false,
          IpcMode: "private",
          CgroupnsMode: "private",
          ShmSize: 67108864,
          Ulimits: [
            { Name: "nofile", Soft: 1024, Hard: 1024 },
            { Name: "fsize", Soft: config.homeBytes, Hard: config.homeBytes },
            ...(config.runtime === "runsc"
              ? [{ Name: "nproc", Soft: config.pids, Hard: config.pids }]
              : []),
          ],
          ReadonlyRootfs: true,
          CapDrop: ["ALL"],
          SecurityOpt: ["no-new-privileges:true"],
          NetworkMode: config.network,
          // Custom bridge networks keep Engine's embedded resolver, with this sole upstream.
          Dns: [config.dnsResolver],
          Init: true,
          Tmpfs: { "/tmp": "rw,nosuid,nodev,noexec,size=67108864,mode=1777" },
          // The Engine refuses archive uploads into a read-only root or a tmpfs, so helper
          // input travels through a private owned volume that the image owns as uid 1000.
          Mounts: [
            { Type: "volume", Source: volume, Target: "/home/computer" },
            { Type: "volume", Source: inputVolume, Target: "/run/raypx" },
            ...(config.runtime === "runsc"
              ? [
                  {
                    Type: "volume",
                    Source: inputVolume,
                    Target: "/etc/resolv.conf",
                    ReadOnly: true,
                    VolumeOptions: { NoCopy: true, Subpath: "resolv.conf" },
                  },
                ]
              : []),
          ],
          LogConfig: { Type: "none" },
        },
      });
      container = result.Id;
      await engine.response(`/containers/${container}/start`, "POST");
      if (networkPolicy) {
        const inspection = await engine.json<{
          NetworkSettings: { Networks: Record<string, { IPAddress: string }> };
        }>(`/containers/${container}/json`);
        const ip = inspection.NetworkSettings.Networks[config.network]?.IPAddress;
        if (!ip) throw new ComputerError("CAPACITY_UNAVAILABLE");
        try {
          await networkPolicy.register(c, ip, networkKey);
        } catch (error) {
          await networkPolicy.remove({ ...c, networkKey }).catch(() => {});
          throw error;
        }
      }
      await verifyWriteAccounting(engine, container);
      return {
        ...c,
        container,
        volume,
        inputVolume,
        networkKey: networkPolicy ? networkKey : null,
        networkBytes: 0,
        startedAt: now(),
        lastActiveAt: now(),
        stopReason: null,
        state: "running" as "running" | "stopped",
      };
    } catch (error) {
      if (container)
        await engine
          .response(`/containers/${container}?force=true&v=true`, "DELETE", undefined, [404])
          .catch(() => {
            accountingHealthy = false;
          });
      await networkPolicy?.remove({ ...c, networkKey }).catch(() => {
        accountingHealthy = false;
      });
      await engine.response(`/volumes/${inputVolume}`, "DELETE", undefined, [404]).catch(() => {
        accountingHealthy = false;
      });
      await engine.response(`/volumes/${volume}`, "DELETE", undefined, [404]).catch(() => {
        accountingHealthy = false;
      });
      throw error;
    }
  }
  async function remove(c: StoredComputer) {
    try {
      if (c.container)
        await engine.response(
          `/containers/${c.container}?force=true&v=true`,
          "DELETE",
          undefined,
          [404],
        );
      await networkPolicy?.remove(c);
      if (c.inputVolume)
        await engine.response(`/volumes/${c.inputVolume}`, "DELETE", undefined, [404]);
      if (c.volume) await engine.response(`/volumes/${c.volume}`, "DELETE", undefined, [404]);
    } catch (error) {
      accountingHealthy = false;
      throw error;
    }
  }
  async function cancelAll(id: string) {
    const processes = [...(active.get(id) ?? [])];
    await Promise.all(processes.map((p) => p.cancel()));
    await Promise.all(processes.map((p) => p.done));
  }
  function endScreen(id: string) {
    screenFailures.delete(id);
    screenEpochs.set(id, (screenEpochs.get(id) ?? 0) + 1);
  }
  async function screenOperation(ref: ComputerRef, operation: string, input = {}) {
    const c = await current(ref, true);
    if (!graphicalAvailable) throw new ComputerError("SCREEN_UNAVAILABLE");
    return engine.helper(
      c.container!,
      `screen-${operation}`,
      input,
      Math.ceil(MAX_COMPUTER_SCREEN_BYTES / 3) * 4 + 1024,
    );
  }
  async function screenshot(ref: ComputerRef): Promise<ComputerScreenFrame> {
    const result = (await screenOperation(ref, "screenshot")) as object;
    const sequence = (frameSequences.get(ref.id) ?? 0) + 1;
    frameSequences.set(ref.id, sequence);
    return computerScreenFrameSchema.parse({ ...result, sequence });
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
    await store.pruneHomes(c.id, c.homeRevision);
    return { revision: validated.revision };
  }
  async function forceStop(c: StoredComputer, reason: StoredComputer["stopReason"]) {
    endScreen(c.id);
    // Stop before cancellation/snapshot I/O: fork/disk attacks must not delay containment.
    if (c.container)
      await engine.response(`/containers/${c.container}/stop?t=0`, "POST", undefined, [404]);
    c.state = "stopped";
    c.stopReason = reason;
    await store.write(c);
    await networkPolicy?.remove(c);
    if (reason !== "storage" && reason !== "measurement" && c.volume) {
      try {
        const validated = await validateHome(await exportStoppedHome(config, engine, c, auxiliary));
        await store.saveHome(c.id, validated.revision, validated.archive);
        c.homeRevision = validated.revision;
        await store.write(c);
        await store.pruneHomes(c.id, c.homeRevision);
      } catch {
        report({ event: "sandbox.snapshot_refused", spaceId: c.spaceId, computerId: c.id });
      }
    }
    report({
      event: "sandbox.stop",
      spaceId: c.spaceId,
      computerId: c.id,
      reason,
      homeBytes: c.homeBytes,
    });
  }
  async function measured(c: StoredComputer) {
    let paused = false;
    try {
      if (c.state === "running" && c.container) {
        await engine.response(`/containers/${c.container}/pause`, "POST");
        paused = true;
      }
      const result = await usage(config, engine, c, auxiliary);
      c.homeBytes = result.bytes;
      if (c.state === "running" && c.container) {
        const bytes = await writtenBytes(engine, c.container);
        if (bytes === undefined) throw new ComputerError("CAPACITY_UNAVAILABLE");
        c.writeBytes = bytes;
      }
      c.homeEntries = result.entries;
      if (
        !result.complete ||
        c.writeBytes > config.homeBytes ||
        c.homeBytes > config.homeBytes ||
        c.homeEntries > config.homeEntries
      ) {
        if (paused) {
          await engine.response(`/containers/${c.container}/unpause`, "POST");
          paused = false;
        }
        await forceStop(c, "storage");
        throw new ComputerError("HOME_STORAGE_LIMIT");
      }
    } catch (error) {
      if (paused) {
        await engine.response(`/containers/${c.container}/unpause`, "POST").catch(() => {});
        paused = false;
      }
      if (c.state === "running") await forceStop(c, "measurement");
      if (error instanceof ComputerError && error.code === "HOME_STORAGE_LIMIT") throw error;
      throw new ComputerError("CAPACITY_UNAVAILABLE");
    } finally {
      if (paused) await engine.response(`/containers/${c.container}/unpause`, "POST");
    }
  }
  async function admit(c: StoredComputer, replacement = false) {
    if (!accountingHealthy) throw new ComputerError("CAPACITY_UNAVAILABLE");
    const all = await store.all();
    const running = all.filter((row) => row.state === "running" && row.id !== c.id);
    if (running.filter((row) => row.spaceId === c.spaceId).length >= config.spaceRunning)
      throw new ComputerError("SPACE_RUNNING_LIMIT");
    if (running.length >= config.deploymentRunning)
      throw new ComputerError("DEPLOYMENT_RUNNING_LIMIT");
    // Reserve a full home + one bounded encoded snapshot, including stopped/destroyed homes.
    // Replacement imports temporarily need a second working home.
    const charge = config.homeBytes + MAX_HOME_BYTES * 2;
    const retained = all.filter((row) => row.id !== c.id && (row.volume || row.homeRevision));
    const extra = replacement && c.volume ? config.homeBytes : 0;
    if (
      retained.filter((row) => row.spaceId === c.spaceId).length * charge + charge + extra >
      config.spaceStorageBytes
    )
      throw new ComputerError("SPACE_STORAGE_LIMIT");
    if (retained.length * charge + charge + extra > config.deploymentStorageBytes)
      throw new ComputerError("DEPLOYMENT_STORAGE_LIMIT");
    if (c.homeBytes > config.homeBytes || c.homeEntries > config.homeEntries)
      throw new ComputerError("HOME_STORAGE_LIMIT");
  }
  async function reapOrphans() {
    const all = await store.all();
    const containers = new Set(all.map((row) => row.container).filter(Boolean));
    const volumes = new Set(all.flatMap((row) => [row.volume, row.inputVolume]).filter(Boolean));
    const filters = encodeURIComponent(
      JSON.stringify({ label: [`raypx.supervisor=${config.network}`] }),
    );
    const owned = await engine.json<{ Id: string; Labels: Record<string, string> }[]>(
      `/containers/json?all=true&filters=${filters}`,
    );
    for (const item of owned) {
      if (
        !["computer", "meter", "snapshot", "setup"].includes(item.Labels["raypx.role"] ?? "") ||
        item.Labels["raypx.supervisor"] !== config.network ||
        containers.has(item.Id) ||
        auxiliary.has(item.Id)
      )
        continue;
      await engine.response(`/containers/${item.Id}?force=true&v=true`, "DELETE", undefined, [404]);
      report({ event: "sandbox.orphan", kind: "container" });
    }
    const ownedVolumes = await engine.json<{
      Volumes: { Name: string; Labels: Record<string, string> }[] | null;
    }>(`/volumes?filters=${filters}`);
    for (const item of ownedVolumes.Volumes ?? []) {
      if (item.Labels["raypx.supervisor"] !== config.network || volumes.has(item.Name)) continue;
      await engine.response(`/volumes/${item.Name}`, "DELETE", undefined, [404]);
      report({ event: "sandbox.orphan", kind: "volume" });
    }
  }
  async function maintain() {
    await serialized(async () => {
      accountingHealthy = false;
      await reapOrphans();
      if (networkPolicy)
        await networkPolicy.reconcile(
          (await store.all())
            .filter((c) => c.state === "running" && c.networkKey)
            .map((c) => c.networkKey!),
        );
      for (const row of await store.all())
        await locked({ id: row.id, generation: row.generation }, async () => {
          const c = await current(row);
          if (!c.volume || c.state === "destroyed") return;
          if (c.state === "running") {
            const live = await engine
              .json<{ State: { Running: boolean } }>(`/containers/${c.container}/json`)
              .catch(() => null);
            if (!live?.State.Running) await forceStop(c, "engine");
            else if (now() - c.startedAt >= config.lifetimeMs) await forceStop(c, "lifetime");
            else if (!active.get(c.id)?.size && now() - c.lastActiveAt >= config.idleMs) {
              await forceStop(c, "idle");
            }
          }
          await measured(c).catch((error: unknown) => {
            report({
              event: "sandbox.accounting_refused",
              spaceId: c.spaceId,
              computerId: c.id,
              code: error instanceof ComputerError ? error.code : "CAPACITY_UNAVAILABLE",
            });
          });
          await store.write(c);
          report({
            event: "sandbox.usage",
            spaceId: c.spaceId,
            computerId: c.id,
            running: c.state === "running",
            homeBytes: c.homeBytes,
            homeEntries: c.homeEntries,
            guestPids: config.pids,
            hostPids: config.hostPids,
            writeBytes: c.writeBytes,
            runtime: config.runtime,
          });
          await store.pruneHomes(c.id, c.homeRevision);
        });
      accountingHealthy = true;
    });
  }
  async function sampleNetwork(c: StoredComputer) {
    if (!networkPolicy || c.state !== "running") return;
    try {
      const value = await networkPolicy.sample(c);
      c.networkBytes = value.bytes;
      report({
        event: "sandbox.network",
        computerId: c.id,
        spaceId: c.spaceId,
        bytes: value.bytes,
        reservedBytes: value.reservedBytes,
        spaceReservedBytes: value.spaceReservedBytes,
      });
      if (value.reason)
        await forceStop(
          c,
          value.reason === "COMPUTER_TRANSFER_LIMIT" ? "transfer" : "space-transfer",
        );
      else await store.write(c);
    } catch {
      if (c.state === "running") await forceStop(c, "network");
      throw new ComputerError("CAPACITY_UNAVAILABLE");
    }
  }
  async function maintainNetwork() {
    if (!networkPolicy) return;
    for (const row of await store.all())
      if (row.state === "running")
        await locked({ id: row.id, generation: row.generation }, async () => {
          await sampleNetwork(await current(row));
        });
  }
  return {
    async initialize() {
      await store.pruneTemporary();
      await verifyRuntime(config, engine);
      await ensureNetwork();
      // A crashed monitor leaves no live command handles. Contain retained compute
      // before admitting callers, including a tenant paused during its last meter.
      for (const row of await store.all())
        if (row.state === "running") await forceStop(row, "engine");
      await maintain();
      if (config.graphical) {
        let candidate: StoredComputer | undefined;
        let phase = "create";
        try {
          candidate = await create({
            id: crypto.randomUUID(),
            generation: 1,
            spaceId: "supervisor-capability-check",
            state: "stopped",
            container: null,
            volume: null,
            inputVolume: null,
            homeRevision: null,
            startedAt: now(),
            lastActiveAt: now(),
            homeBytes: 0,
            homeEntries: 0,
            writeBytes: 0,
            stopReason: null,
          });
          phase = "start";
          await engine.helper(candidate.container!, "screen-start");
          phase = "capture";
          await engine.helper(
            candidate.container!,
            "screen-screenshot",
            {},
            Math.ceil(MAX_COMPUTER_SCREEN_BYTES / 3) * 4 + 1024,
          );
          phase = "stop";
          await engine.helper(candidate.container!, "screen-stop");
        } catch {
          graphicalAvailable = false;
          graphicalReason = "GRAPHICAL_RUNTIME_UNAVAILABLE";
          report({
            event: "sandbox.graphical_unavailable",
            phase,
            runtime: config.runtime,
            reason: graphicalReason,
          });
        } finally {
          if (candidate) await remove(candidate);
        }
      }
    },
    maintain,
    maintainNetwork,
    async describe() {
      const restricted = config.restrictedEgress && config.hostRulesApplied;
      return {
        execution: "isolated-process",
        files: true,
        home: true,
        screen: graphicalAvailable,
        ...(!graphicalAvailable ? { screenUnavailableReason: graphicalReason } : {}),
        egress: restricted ? "restricted" : "unrestricted",
        unenforced: restricted
          ? [
              "Host firewall rules are an operator assertion; the supervisor cannot verify them",
              networkPolicy
                ? "Network limits cover forwarded IP bytes, excluding private control streams and upstream ingress already received by the host"
                : "Network transfer and connection budgets are not enabled",
              `Home disk usage is measured every ${config.reapMs} ms; writes may overshoot before stop. No filesystem hard quota`,
              "Cancellation covers a process group; detached descendants require container stop/destroy",
            ]
          : [
              "Network egress to host, LAN and metadata is not restricted without the host ruleset",
              `Home disk usage is measured every ${config.reapMs} ms; writes may overshoot before stop. No filesystem hard quota`,
              "Cancellation covers a process group; detached descendants require container stop/destroy",
            ],
      };
    },
    get: (ref) =>
      locked(ref, async () => {
        const c = await current(ref);
        await sampleNetwork(c);
        return publicComputer(c);
      }),
    provision: (ref, context) =>
      serialized(() =>
        locked(ref, async () => {
          let c = await store.read(ref.id);
          if (config.untrustedTenants && !context?.spaceId)
            throw new ComputerError("INVALID_INPUT");
          if (c && context && c.spaceId !== context.spaceId)
            throw new ComputerError("INVALID_INPUT");
          if (c && c.generation > ref.generation) throw new ComputerError("STALE_GENERATION");
          if (c && c.generation === ref.generation) {
            if (c.state === "destroyed") throw new ComputerError("NOT_RUNNING");
            if (c.container) {
              const live = await engine.json<{ State: { Running: boolean; Paused?: boolean } }>(
                `/containers/${c.container}/json`,
              );
              if (!live.State.Running) {
                c.state = "stopped";
                await measured(c);
                await admit(c);
                await engine.response(`/containers/${c.container}/start`, "POST");
                c.startedAt = now();
                c.lastActiveAt = now();
                c.stopReason = null;
              }
              c.state = "running";
              await store.write(c);
              return publicComputer(c);
            }
          }
          const old = c;
          endScreen(ref.id);
          c = {
            ...ref,
            state: "stopped",
            container: null,
            volume: null,
            inputVolume: null,
            spaceId: old?.spaceId ?? context?.spaceId ?? ref.id,
            startedAt: now(),
            lastActiveAt: now(),
            homeBytes: 0,
            writeBytes: 0,
            homeEntries: 0,
            stopReason: null,
            homeRevision: old?.homeRevision ?? null,
          };
          await admit(c);
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
              if (restored.revision !== validated.revision)
                throw new ComputerError("RESTORE_FAILED");
            }
            await measured(candidate);
            await store.write(candidate);
            report({
              event: "sandbox.start",
              spaceId: candidate.spaceId,
              computerId: candidate.id,
              runtime: config.runtime,
            });
            return publicComputer(candidate);
          } catch (error) {
            if (candidate) await remove(candidate).catch(() => {});
            await store.write(c);
            if (
              error instanceof ComputerError &&
              ["HOME_STORAGE_LIMIT", "CAPACITY_UNAVAILABLE"].includes(error.code)
            )
              throw error;
            if (c.homeRevision) throw new ComputerError("RESTORE_FAILED");
            throw error;
          }
        }),
      ),
    stop: (ref) =>
      serialized(() =>
        locked(ref, async () => {
          const c = await current(ref);
          if (c.state !== "running") return publicComputer(c);
          if (graphicalAvailable) await screenOperation(ref, "stop").catch(() => {});
          endScreen(ref.id);
          try {
            await snapshotCurrent(c);
          } catch (error) {
            await forceStop(c, "engine");
            throw error;
          }
          await engine.response(`/containers/${c.container}/stop?t=10`, "POST");
          await networkPolicy?.remove(c);
          c.state = "stopped";
          await store.write(c);
          report({
            event: "sandbox.stop",
            spaceId: c.spaceId,
            computerId: c.id,
            reason: "requested",
            homeBytes: c.homeBytes,
          });
          return publicComputer(c);
        }),
      ),
    destroy: (ref) =>
      locked(ref, async () => {
        const c = await current(ref);
        if (c.state === "destroyed") return publicComputer(c);
        endScreen(ref.id);
        await cancelAll(ref.id);
        await remove(c);
        c.container = null;
        c.volume = null;
        c.inputVolume = null;
        c.state = "destroyed";
        await store.write(c);
        report({ event: "sandbox.destroy", spaceId: c.spaceId, computerId: c.id });
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
        let finished = false;
        let done!: () => void;
        const completion = new Promise<void>((resolve) => {
          done = resolve;
        });
        const process = {
          done: completion,
          cancel: async () => {
            if (finished) return;
            cancelled = true;
            await engine.helper(c.container!, "cancel", { executionId });
          },
        };
        const cancel = () => {
          cancelled = true;
          return locked(ref, () => process.cancel());
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
                for await (const event of exec.events) {
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
                finished = true;
                processes.delete(process);
                if (!processes.size) active.delete(ref.id);
                // Touch under the per-computer lock; never race a generation replacement.
                void locked(ref, async () => {
                  const row = await store.read(ref.id);
                  if (row?.generation === ref.generation && row.state === "running") {
                    row.lastActiveAt = now();
                    await store.write(row);
                  }
                }).catch(() => {});
                done();
              }
            })();
          },
          cancel,
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
        return { events: events(), cancel };
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
        // Inbox attachments use this same port. Confirm their bytes/parents and
        // helper transfer I/O fit before reporting delivery as successful.
        await measured(c);
        await store.write(c);
      }),
    exportHome: (ref) =>
      serialized(() =>
        locked(ref, async () => {
          const c = await current(ref);
          if (c.state !== "running") {
            if (c.homeRevision) return store.home(c.id, c.homeRevision);
            throw new ComputerError("NOT_RUNNING");
          }
          await cancelAll(ref.id);
          return (await validateHome(await engine.helper(c.container!, "export"))).archive;
        }),
      ),
    importHome: (ref, input) =>
      serialized(() =>
        locked(ref, async () => {
          const c = await current(ref);
          if (c.state === "destroyed") throw new ComputerError("NOT_RUNNING");
          const validated = await validateHome(input);
          endScreen(ref.id);
          await cancelAll(ref.id);
          await admit(c, true);
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
            await measured(candidate);
            candidate.homeRevision = validated.revision;
            await store.write(candidate);
          } catch {
            await remove(candidate).catch(() => {});
            await store.write(c);
            throw new ComputerError("RESTORE_FAILED");
          }
          if (c.container) await remove(c);
          await store.pruneHomes(c.id, validated.revision);
          return { revision: validated.revision };
        }),
      ),
    snapshot: (ref) =>
      serialized(() => locked(ref, async () => snapshotCurrent(await current(ref)))),
    screen: (ref) =>
      locked(ref, async () => {
        await current(ref, true);
        if (!graphicalAvailable || screenFailures.get(ref.id) === ref.generation)
          return {
            available: false,
            reason: graphicalAvailable ? "GRAPHICAL_RUNTIME_UNAVAILABLE" : graphicalReason,
            running: false,
            width: 1024,
            height: 768,
          };
        return computerScreenAvailabilitySchema.parse(await screenOperation(ref, "get"));
      }),
    startScreen: (ref) =>
      locked(ref, async () => {
        try {
          const result = computerScreenAvailabilitySchema.parse(
            await screenOperation(ref, "start"),
          );
          screenFailures.delete(ref.id);
          return result;
        } catch (error) {
          if (
            error instanceof ComputerError &&
            ["NOT_RUNNING", "NOT_FOUND", "STALE_GENERATION"].includes(error.code)
          )
            throw error;
          screenFailures.set(ref.id, ref.generation);
          throw new ComputerError("SCREEN_UNAVAILABLE");
        }
      }),
    stopScreen: (ref) =>
      locked(ref, async () => {
        const result = computerScreenAvailabilitySchema.parse(await screenOperation(ref, "stop"));
        endScreen(ref.id);
        return result;
      }),
    screenshot: (ref) => locked(ref, () => screenshot(ref)),
    input: (ref, input) =>
      locked(ref, async () => {
        await screenOperation(ref, "input", { input: computerScreenInputSchema.parse(input) });
      }),
    streamScreen(ref, options) {
      const epoch = screenEpochs.get(ref.id) ?? 0;
      return (async function* () {
        while (!options?.signal?.aborted && (screenEpochs.get(ref.id) ?? 0) === epoch) {
          try {
            const frame = await locked(ref, () => screenshot(ref));
            if (options?.signal?.aborted || (screenEpochs.get(ref.id) ?? 0) !== epoch) return;
            yield frame;
          } catch (error) {
            if (
              error instanceof ComputerError &&
              ["NOT_RUNNING", "NOT_FOUND", "STALE_GENERATION"].includes(error.code)
            )
              return;
            throw error;
          }
          await new Promise<void>((resolve) => {
            const finish = () => {
              clearTimeout(timer);
              options?.signal?.removeEventListener("abort", finish);
              resolve();
            };
            const timer = setTimeout(finish, 1000 / MAX_COMPUTER_SCREEN_FPS);
            options?.signal?.addEventListener("abort", finish, { once: true });
            if (options?.signal?.aborted) finish();
          });
        }
      })();
    },
  };
}
