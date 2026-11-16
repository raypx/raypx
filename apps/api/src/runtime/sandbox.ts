import { and, eq, isNull, or } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { computers, sandboxConfiguration } from "@raypx/database/schema";
import { ComputerError, type ComputerProvider, type ComputerRef } from "@raypx/providers/computer";
import { createDockerComputerProvider } from "@raypx/providers/computer/docker";
import { createE2bComputerProvider } from "@raypx/providers/computer/e2b";
import {
  sandboxCipher,
  sandboxCredentialTarget,
  sandboxSettingsId,
} from "../config/sandbox-initialization.js";
import type { ConfigReads } from "../config/reads.js";
import { postgresE2bPlacement } from "./e2b-placement.js";

/** Construction registers a loader only. PostgreSQL is read at every operation admission. */
export function databaseComputerProvider(db: Database, secret: string, reads: ConfigReads) {
  const cipher = sandboxCipher(secret);
  const source = reads.source("sandbox", async () => {
    const [row] = await db
      .select()
      .from(sandboxConfiguration)
      .where(eq(sandboxConfiguration.id, sandboxSettingsId));
    return row;
  });
  const protectedValues = new Set<string>();
  let active: { revision: number; provider: ComputerProvider } | undefined;
  async function current() {
    try {
      const row = await source.read();
      if (
        !row ||
        row.provider === "none" ||
        !row.credentials ||
        (row.provider === "docker" ? !row.url : !row.template)
      )
        throw new ComputerError("PROVIDER_UNAVAILABLE");
      if (active?.revision !== row.revision) {
        const token = await cipher.open(row.credentials, sandboxCredentialTarget(row));
        protectedValues.add(token);
        if (protectedValues.size > 32)
          protectedValues.delete(protectedValues.values().next().value!);
        const provider =
          row.provider === "docker"
            ? createDockerComputerProvider({ url: row.url!, token })
            : createE2bComputerProvider({
                apiKey: token,
                template: row.template!,
                store: postgresE2bPlacement(db, row.template!),
              });
        active = { revision: row.revision, provider };
      }
      return { ...row, kind: row.provider, provider: active.provider };
    } catch {
      throw new ComputerError("PROVIDER_UNAVAILABLE");
    }
  }
  async function unchanged(revision: number) {
    try {
      if ((await source.read())?.revision !== revision)
        throw new ComputerError("PROVIDER_UNAVAILABLE");
    } catch {
      throw new ComputerError("PROVIDER_UNAVAILABLE");
    }
  }
  async function placement(ref: ComputerRef, url: string, spaceId?: string) {
    if (spaceId) {
      // Persist placement before remote I/O, even if its outcome later becomes unknown.
      await db
        .update(computers)
        .set({ supervisorUrl: url })
        .where(
          and(
            eq(computers.id, ref.id),
            eq(computers.spaceId, spaceId),
            eq(computers.provider, "sandbox"),
            or(isNull(computers.supervisorUrl), eq(computers.supervisorUrl, url)),
            eq(computers.e2bPlaced, false),
          ),
        );
    }
    const [row] = await db
      .select({ url: computers.supervisorUrl })
      .from(computers)
      .where(and(eq(computers.id, ref.id), eq(computers.provider, "sandbox")));
    if (row?.url !== url) throw new ComputerError("PROVIDER_UNAVAILABLE");
  }
  async function call<T>(
    run: (provider: ComputerProvider) => Promise<T>,
    ref?: ComputerRef,
    screen = false,
  ) {
    const saved = await current();
    if (screen && (saved.kind !== "docker" || !saved.screen))
      throw new ComputerError("SCREEN_UNAVAILABLE");
    if (ref && saved.kind === "docker") await placement(ref, saved.url!);
    const result = await run(saved.provider);
    await unchanged(saved.revision);
    return result;
  }
  /** Check even a silent stream, and never publish success from a retired revision. */
  async function* guarded<T>(events: AsyncIterable<T>, revision: number): AsyncIterable<T> {
    const iterator = events[Symbol.asyncIterator]();
    try {
      let next = iterator.next();
      while (true) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const tick = new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), 1000);
        });
        let item: IteratorResult<T> | null;
        try {
          item = await Promise.race([next, tick]);
        } finally {
          clearTimeout(timer);
        }
        await unchanged(revision);
        if (!item) continue;
        if (item.done) return;
        yield item.value;
        next = iterator.next();
      }
    } finally {
      void iterator.return?.().catch(() => {});
    }
  }
  const provider: ComputerProvider = {
    async configured() {
      try {
        const row = await source.read();
        return Boolean(
          row?.credentials &&
          (row.provider === "docker" ? row.url : row.provider === "e2b" && row.template),
        );
      } catch {
        throw new ComputerError("PROVIDER_UNAVAILABLE");
      }
    },
    describe: () =>
      call(async (p) => {
        const description = await p.describe();
        const row = await current();
        return { ...description, screen: row.screen && description.screen === true };
      }),
    get: (ref) => call((p) => p.get(ref), ref),
    async provision(ref, context) {
      const saved = await current();
      if (saved.kind === "docker") await placement(ref, saved.url!, context?.spaceId);
      await unchanged(saved.revision);
      const result = await saved.provider.provision(ref, context);
      try {
        await unchanged(saved.revision);
      } catch {
        // Best effort containment at the original destination, never at a replacement host.
        await saved.provider.stop(ref).catch(() => {});
        throw new ComputerError("PROVIDER_UNAVAILABLE");
      }
      return result;
    },
    stop: (ref) => call((p) => p.stop(ref), ref),
    destroy: (ref) => call((p) => p.destroy(ref), ref),
    async execute(ref, command) {
      const saved = await current();
      if (saved.kind === "docker") await placement(ref, saved.url!);
      const process = await saved.provider.execute(ref, command);
      async function* events() {
        let completed = false;
        try {
          yield* guarded(process.events, saved.revision);
          completed = true;
        } finally {
          if (!completed) await process.cancel().catch(() => {});
        }
      }
      return { events: events(), cancel: process.cancel };
    },
    list: (ref, path, limit) => call((p) => p.list(ref, path, limit), ref),
    read: (ref, path, maxBytes) => call((p) => p.read(ref, path, maxBytes), ref),
    readFile: (ref, path, maxBytes) => call((p) => p.readFile!(ref, path, maxBytes), ref),
    write: (ref, path, bytes) => call((p) => p.write(ref, path, bytes), ref),
    searchFiles: (ref, input) => call((p) => p.searchFiles!(ref, input), ref),
    replaceFile: (ref, path, replacement) =>
      call((p) => p.replaceFile!(ref, path, replacement), ref),
    exportHome: (ref) => call((p) => p.exportHome(ref), ref),
    importHome: (ref, archive) => call((p) => p.importHome(ref, archive), ref),
    snapshot: (ref) => call((p) => p.snapshot(ref), ref),
    screen: (ref) => call((p) => p.screen!(ref), ref, true),
    startScreen: (ref) => call((p) => p.startScreen!(ref), ref, true),
    stopScreen: (ref) => call((p) => p.stopScreen!(ref), ref, true),
    screenshot: (ref) => call((p) => p.screenshot!(ref), ref, true),
    input: (ref, input) => call((p) => p.input!(ref, input), ref, true),
    async *streamScreen(ref, options) {
      const saved = await current();
      if (saved.kind !== "docker" || !saved.screen) throw new ComputerError("SCREEN_UNAVAILABLE");
      if (saved.kind === "docker") await placement(ref, saved.url!);
      const controller = new AbortController();
      const signal = options?.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal;
      try {
        yield* guarded(saved.provider.streamScreen!(ref, { signal }), saved.revision);
      } finally {
        controller.abort();
      }
    },
  };
  return { provider, protectedValues: () => [...protectedValues] };
}
