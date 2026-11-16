import type { CommandHandle, Sandbox } from "e2b";
import { z } from "zod";
import {
  bound,
  commandSchema,
  ComputerError,
  fileEntrySchema,
  MAX_HOME_BYTES,
  processEventSchema,
  validateHome,
  workspacePath,
  type ComputerCommand,
  type ComputerProcess,
  type ComputerProvider,
  type ComputerRef,
  type HomeArchive,
  type ProcessEvent,
  type ProviderComputer,
} from "./port.js";

const helper = "/opt/raypx/e2b.py";
const python = ["/usr/bin/env", "python3", "-I"];
const guestEnvironment = { PATH: "/usr/local/bin:/usr/bin:/bin" };
const homeResponseLimit = MAX_HOME_BYTES * 2;
const commandTimeout = 60_000;

export interface E2bPlacement {
  spaceId: string;
  sandboxId: string | null;
  sandboxGeneration: number | null;
  createKey: string | null;
  ready: boolean;
  destroyed: boolean;
  homeRevision: string | null;
}
type PlacementUpdate = Partial<Omit<E2bPlacement, "spaceId">> & { archive?: HomeArchive };
interface E2bTransaction {
  placement: E2bPlacement;
  loadHome(): Promise<unknown>;
  save(update: PlacementUpdate): Promise<void>;
}
export interface E2bPlacementStore {
  locked<T>(
    ref: ComputerRef,
    spaceId: string | undefined,
    operation: "provision" | "inspect" | "stop" | "use",
    run: (transaction: E2bTransaction) => Promise<T>,
  ): Promise<T>;
}
type Guest = Pick<Sandbox, "sandboxId" | "commands">;

function connection(apiKey: string) {
  return {
    apiKey,
    domain: "e2b.app",
    apiUrl: "https://api.e2b.app",
    sandboxUrl: "https://sandbox.e2b.app",
    debug: false,
    requestTimeoutMs: 20_000,
  } as const;
}

export async function testE2bConnection(apiKey: string) {
  try {
    const { Sandbox, AuthenticationError, TimeoutError } = await import("e2b");
    try {
      await Sandbox.list({
        ...connection(apiKey),
        requestTimeoutMs: 5000,
        retries: 0,
        limit: 1,
      }).nextItems();
      return { status: "e2b-connected" } as const;
    } catch (error) {
      if (error instanceof AuthenticationError) return { status: "authentication-failed" } as const;
      if (error instanceof TimeoutError) return { status: "timeout" } as const;
      return { status: "unavailable" } as const;
    }
  } catch {
    return { status: "unavailable" } as const;
  }
}

function outputCollector(limit: number) {
  const chunks: string[] = [];
  let bytes = 0;
  return {
    add(chunk: string) {
      bytes += Buffer.byteLength(chunk);
      if (bytes > limit) throw new ComputerError("LIMIT_EXCEEDED");
      chunks.push(chunk);
    },
    get value() {
      return chunks.join("");
    },
  };
}

async function sendGuestInput(
  handle: Pick<CommandHandle<string | undefined>, "sendStdin" | "closeStdin" | "kill">,
  data: Uint8Array,
  signal: AbortSignal,
) {
  try {
    // Keep frames below the SDK RPC limit and preserve order.
    for (let offset = 0; offset < data.length; offset += 512 * 1024)
      await handle.sendStdin(data.subarray(offset, offset + 512 * 1024), { signal });
    await handle.closeStdin({ signal });
  } catch {
    await handle.kill().catch(() => {});
    throw new ComputerError("PROVIDER_UNAVAILABLE");
  }
}

async function startGuest(
  guest: Guest,
  operation: string,
  payload: unknown,
  onStdout: (chunk: string) => void,
) {
  const signal = AbortSignal.timeout(commandTimeout);
  const data = Buffer.from(JSON.stringify(payload));
  if (data.length > homeResponseLimit + 1024) throw new ComputerError("LIMIT_EXCEEDED");
  const handle = await guest.commands.run("raypx", {
    shell: [...python, helper, operation],
    envs: guestEnvironment,
    user: "computer",
    cwd: "/",
    background: true,
    stdin: true,
    retainOutput: false,
    onStdout,
    timeoutMs: commandTimeout,
  });
  await sendGuestInput(handle, data, signal);
  return handle;
}

async function initializeGuest(candidate: Guest) {
  const { bootstrap, home, guest } = await import("./e2b-guest/sources.js");
  const timeout = 20_000;
  const signal = AbortSignal.timeout(timeout);
  const handle = await candidate.commands.run("raypx-bootstrap", {
    shell: [...python, "-c", bootstrap],
    envs: guestEnvironment,
    user: "root",
    cwd: "/",
    background: true,
    stdin: true,
    retainOutput: false,
    timeoutMs: timeout,
  });
  await sendGuestInput(handle, Buffer.from(JSON.stringify({ home, guest })), signal);
  await handle.wait();
  await invoke(candidate, "list", { path: "", limit: 1 }, listing);
}

const guestError = z.object({
  code: z.enum(["INVALID_INPUT", "NOT_FOUND", "LIMIT_EXCEEDED", "RESTORE_FAILED"]),
});
const listing = z.strictObject({
  entries: z.array(fileEntrySchema).max(1000),
  truncated: z.boolean(),
});
const file = z.strictObject({ bytes: z.base64() });
const preview = file.extend({ size: z.number().int().nonnegative(), truncated: z.boolean() });
const empty = z.strictObject({});

async function invoke<T>(
  guest: Guest,
  operation: string,
  payload: unknown,
  schema: z.ZodType<T>,
  limit = 1024 * 1024,
): Promise<T> {
  const output = outputCollector(limit);
  const handle = await startGuest(guest, operation, payload, (chunk) => output.add(chunk));
  await handle.wait();
  const result: unknown = JSON.parse(output.value);
  const error = guestError.safeParse(result);
  if (error.success) throw new ComputerError(error.data.code);
  return schema.parse(result);
}

async function exportHome(guest: Guest) {
  const archive = await invoke(guest, "export", {}, z.unknown(), homeResponseLimit);
  return await validateHome(archive as HomeArchive);
}

async function restoreHome(guest: Guest, archive: unknown, revision: string) {
  try {
    const validated = await validateHome(archive as HomeArchive);
    if (validated.revision !== revision) throw new ComputerError("RESTORE_FAILED");
    await invoke(guest, "import", { archive: validated.archive }, empty);
    if ((await exportHome(guest)).revision !== revision) throw new ComputerError("RESTORE_FAILED");
  } catch {
    throw new ComputerError("RESTORE_FAILED");
  }
}

async function executeGuest(guest: Guest, command: ComputerCommand): Promise<ComputerProcess> {
  const executionId = crypto.randomUUID();
  let pending = "";
  let remaining = command.outputBudget;
  let truncated = false;
  let cancelled = false;
  let exit: Extract<ProcessEvent, { kind: "exit" }> | undefined;
  let done = false;
  let failure: unknown;
  let wake: (() => void) | undefined;
  const queue: ProcessEvent[] = [];
  const { protectedInput: _protectedInput, ...input } = command;
  const handle = await startGuest(guest, "exec", { ...input, executionId }, (chunk) => {
    pending += chunk;
    for (let newline = pending.indexOf("\n"); newline !== -1; newline = pending.indexOf("\n")) {
      if (newline > 16_384) throw new ComputerError("PROVIDER_UNAVAILABLE");
      const event = processEventSchema.parse(JSON.parse(pending.slice(0, newline)));
      pending = pending.slice(newline + 1);
      if (exit) throw new ComputerError("PROVIDER_UNAVAILABLE");
      if (event.kind === "exit") {
        exit = event;
      } else {
        const bytes = Buffer.from(event.bytes, "base64");
        const take = Math.min(remaining, bytes.length);
        if (take)
          queue.push({ kind: event.kind, bytes: bytes.subarray(0, take).toString("base64") });
        remaining -= take;
        truncated ||= take !== bytes.length;
      }
      wake?.();
    }
    if (pending.length > 16_384) throw new ComputerError("PROVIDER_UNAVAILABLE");
  });
  void handle
    .wait()
    .then(
      () => {
        if (!exit || pending) failure = new ComputerError("PROVIDER_UNAVAILABLE");
      },
      () => {
        failure = new ComputerError("PROVIDER_UNAVAILABLE");
      },
    )
    .finally(() => {
      done = true;
      wake?.();
    });
  async function* events(): AsyncIterable<ProcessEvent> {
    while (true) {
      if (queue.length) {
        yield queue.shift()!;
        continue;
      }
      if (done) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
    if (cancelled) {
      yield {
        kind: "exit",
        status: 137,
        cancelled: true,
        truncated: truncated || (exit?.truncated ?? false),
      };
    } else {
      if (failure || !exit) throw new ComputerError("PROVIDER_UNAVAILABLE");
      yield { ...exit, truncated: exit.truncated || truncated };
    }
  }
  return {
    events: events(),
    async cancel() {
      if (done || cancelled) return;
      await invoke(guest, "cancel", { executionId }, empty);
      cancelled = true;
    },
  };
}

export function createE2bComputerProvider(options: {
  apiKey: string;
  template: string;
  store: E2bPlacementStore;
  loadSdk?: () => Promise<Pick<typeof import("e2b"), "Sandbox" | "SandboxNotFoundError">>;
}): ComputerProvider {
  const config = connection(options.apiKey);
  const loadSdk = options.loadSdk ?? (() => import("e2b"));
  async function remoteState(id: string) {
    const { Sandbox, SandboxNotFoundError } = await loadSdk();
    try {
      return (await Sandbox.getInfo(id, config)).state;
    } catch (error) {
      if (error instanceof SandboxNotFoundError) return null;
      throw error;
    }
  }
  async function connect(id: string) {
    const { Sandbox } = await loadSdk();
    return await Sandbox.connect(id, { ...config, timeoutMs: 120_000, onResume: "reboot" });
  }
  async function findCreation(key: string) {
    const { Sandbox } = await loadSdk();
    const pages = Sandbox.list({
      ...config,
      query: { metadata: { raypxCreateKey: key } },
      limit: 2,
    });
    const rows = await pages.nextItems();
    if (rows.length > 1 || pages.hasNext) throw new ComputerError("PROVIDER_UNAVAILABLE");
    return rows[0]?.sandboxId;
  }
  async function create(idempotencyKey: string) {
    const { Sandbox } = await loadSdk();
    // The UUIDv7 timestamp keeps a retry inside E2B's 24-hour idempotency window.
    const issuedAt = Number.parseInt(idempotencyKey.replaceAll("-", "").slice(0, 12), 16);
    if (Date.now() - issuedAt < 23 * 60 * 60_000) {
      try {
        const candidate = await Sandbox.create(options.template, {
          ...config,
          idempotencyKey,
          metadata: { raypxCreateKey: idempotencyKey },
          timeoutMs: 15 * 60_000,
          lifecycle: { onTimeout: { action: "pause", mode: "filesystem" } },
          allowInternetAccess: false,
          network: { allowPublicTraffic: false },
        });
        return candidate.sandboxId;
      } catch {
        // A lost response can leave an instance even when the create request rejects.
      }
    }
    const id = await findCreation(idempotencyKey);
    if (!id) throw new ComputerError("PROVIDER_UNAVAILABLE");
    return id;
  }
  async function pause(id: string) {
    const { Sandbox } = await loadSdk();
    if (!(await Sandbox.pause(id, { ...config, mode: "filesystem" })))
      throw new ComputerError("PROVIDER_UNAVAILABLE");
  }
  async function kill(id: string) {
    const { Sandbox } = await loadSdk();
    await Sandbox.kill(id, config);
  }
  async function guard<T>(run: () => Promise<T>) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ComputerError) throw error;
      throw new ComputerError("PROVIDER_UNAVAILABLE");
    }
  }
  function locked<T>(
    ref: ComputerRef,
    operation: "provision" | "inspect" | "stop" | "use",
    run: (transaction: E2bTransaction) => Promise<T>,
    spaceId?: string,
  ) {
    return guard(() => options.store.locked(ref, spaceId, operation, run));
  }
  function view(
    ref: ComputerRef,
    placement: E2bPlacement,
    state: ProviderComputer["state"],
  ): ProviderComputer {
    return { id: ref.id, generation: ref.generation, state, homeRevision: placement.homeRevision };
  }
  async function running(ref: ComputerRef, transaction: E2bTransaction) {
    const p = transaction.placement;
    if (!p.ready || !p.sandboxId || p.sandboxGeneration !== ref.generation)
      throw new ComputerError("NOT_RUNNING");
    if ((await remoteState(p.sandboxId)) !== "running") throw new ComputerError("NOT_RUNNING");
    return await connect(p.sandboxId);
  }
  async function snapshot(ref: ComputerRef) {
    return locked(ref, "use", async (tx) => {
      const { archive, revision } = await exportHome(await running(ref, tx));
      await tx.save({ archive, homeRevision: revision });
      return { revision };
    });
  }
  async function stop(ref: ComputerRef, destroy = false) {
    // Commit the archive and block new calls before asking E2B to delete compute.
    await locked(ref, "stop", async (tx) => {
      const p = tx.placement;
      if (p.ready && p.sandboxId) {
        const { archive, revision } = await exportHome(await connect(p.sandboxId));
        await tx.save({ archive, homeRevision: revision, ready: false });
      }
    });
    return locked(ref, "stop", async (tx) => {
      const p = tx.placement;
      let id = p.sandboxId;
      if (!id && p.createKey) {
        id = (await findCreation(p.createKey)) ?? null;
        if (!id) throw new ComputerError("PROVIDER_UNAVAILABLE");
      }
      if (id) await kill(id);
      await tx.save({ sandboxId: null, createKey: null, destroyed: destroy || p.destroyed });
      return view(ref, p, destroy || p.destroyed ? "destroyed" : "stopped");
    });
  }
  return {
    async describe() {
      return {
        execution: "isolated-process",
        files: true,
        home: true,
        egress: "restricted",
        unenforced: [],
        screen: false,
      };
    },
    get(ref) {
      return locked(ref, "inspect", async ({ placement: p }) => {
        if (p.destroyed) return view(ref, p, "destroyed");
        if (!p.sandboxId) return view(ref, p, "stopped");
        // A vanished instance may contain data newer than our last committed archive.
        const state = await remoteState(p.sandboxId);
        if (!state && p.ready) throw new ComputerError("PROVIDER_UNAVAILABLE");
        return view(ref, p, state === "running" ? "running" : "stopped");
      });
    },
    async provision(ref, context) {
      await locked(
        ref,
        "provision",
        async (tx) => {
          const p = tx.placement;
          if (p.destroyed && p.sandboxGeneration === ref.generation)
            throw new ComputerError("STALE_GENERATION");
          if (p.sandboxGeneration === ref.generation && p.createKey) return;
          if (!p.sandboxId && p.createKey) {
            // An interrupted creation can be claimed by the new generation. Its key stays fixed.
            await tx.save({ sandboxGeneration: ref.generation });
            return;
          }
          if (p.sandboxId && p.ready) {
            // After idle or a failed stop, retain the disk and discard old processes.
            const state = await remoteState(p.sandboxId);
            if (!state) throw new ComputerError("PROVIDER_UNAVAILABLE");
            if (state === "running") await pause(p.sandboxId);
            await tx.save({ sandboxGeneration: ref.generation, createKey: Bun.randomUUIDv7() });
            return;
          }
          if (p.sandboxId) await kill(p.sandboxId);
          await tx.save({
            sandboxId: null,
            sandboxGeneration: ref.generation,
            createKey: Bun.randomUUIDv7(),
            ready: false,
            destroyed: false,
          });
        },
        context?.spaceId,
      );
      await locked(
        ref,
        "provision",
        async (tx) => {
          const p = tx.placement;
          if (!p.createKey || p.sandboxGeneration !== ref.generation)
            throw new ComputerError("STALE_GENERATION");
          if (p.sandboxId) return;
          const sandboxId = await create(p.createKey);
          await tx.save({ sandboxId });
        },
        context?.spaceId,
      );
      return locked(
        ref,
        "provision",
        async (tx) => {
          const p = tx.placement;
          if (!p.sandboxId || p.sandboxGeneration !== ref.generation)
            throw new ComputerError("STALE_GENERATION");
          if (!p.ready) {
            const candidate = await connect(p.sandboxId);
            await initializeGuest(candidate);
            if (p.homeRevision) await restoreHome(candidate, await tx.loadHome(), p.homeRevision);
            await tx.save({ ready: true });
          } else {
            const state = await remoteState(p.sandboxId);
            if (state === "paused") await connect(p.sandboxId);
            else if (!state) throw new ComputerError("PROVIDER_UNAVAILABLE");
          }
          return view(ref, p, "running");
        },
        context?.spaceId,
      );
    },
    stop: (ref) => stop(ref),
    destroy: (ref) => stop(ref, true),
    execute: (ref, cmd) =>
      locked(ref, "use", async (tx) => {
        const command = commandSchema.parse(cmd);
        command.cwd = workspacePath(command.cwd);
        return executeGuest(await running(ref, tx), command);
      }),
    list: (ref, path, limit) =>
      locked(ref, "use", async (tx) =>
        invoke(
          await running(ref, tx),
          "list",
          { path: workspacePath(path), limit: bound(limit, 1000) },
          listing,
          8 * 1024 * 1024,
        ),
      ),
    read: (ref, path, maxBytes) =>
      locked(ref, "use", async (tx) =>
        invoke(
          await running(ref, tx),
          "read",
          { path: workspacePath(path), maxBytes: bound(maxBytes, MAX_HOME_BYTES) },
          file,
          homeResponseLimit,
        ),
      ),
    readFile: (ref, path, maxBytes) =>
      locked(ref, "use", async (tx) =>
        invoke(
          await running(ref, tx),
          "preview",
          { path: workspacePath(path), maxBytes: bound(maxBytes, 64 * 1024) },
          preview,
        ),
      ),
    write: (ref, path, bytes) =>
      locked(ref, "use", async (tx) => {
        const data = file.parse({ bytes });
        if (Buffer.byteLength(data.bytes, "base64") > MAX_HOME_BYTES)
          throw new ComputerError("LIMIT_EXCEEDED");
        await invoke(
          await running(ref, tx),
          "write",
          { path: workspacePath(path), ...data },
          empty,
        );
      }),
    exportHome: (ref) =>
      locked(ref, "use", async (tx) => (await exportHome(await running(ref, tx))).archive),
    importHome: (ref, input) =>
      locked(ref, "use", async (tx) => {
        const { archive, revision } = await validateHome(input);
        const p = tx.placement;
        if (!p.ready || !p.sandboxId) throw new ComputerError("NOT_RUNNING");
        const sandboxId = await create(Bun.randomUUIDv7());
        try {
          const candidate = await connect(sandboxId);
          await initializeGuest(candidate);
          await restoreHome(candidate, archive, revision);
          await kill(p.sandboxId);
          await tx.save({ sandboxId, archive, homeRevision: revision });
        } catch (error) {
          await kill(sandboxId).catch(() => {});
          throw error;
        }
        return { revision };
      }),
    snapshot,
  };
}
