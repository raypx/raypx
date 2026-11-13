export const configScopes = ["site", "storage", "resend"] as const;
export type ConfigScope = (typeof configScopes)[number];
type ConfigChange = { scope: ConfigScope; revision: number };

export interface ConfigNotifications {
  publish(change: ConfigChange): void;
  subscribe(receive: (change: ConfigChange) => void, resubscribed: () => void): () => void;
}

const ttlMs = 5_000;

function createReader<T>(load: () => Promise<T>, copy: (value: T) => T, now: () => number) {
  let generation = 0;
  let entry: { expiresAt: number; result: Promise<T> } | undefined;

  async function readCached(): Promise<T> {
    const startedAt = now();
    if (!entry || entry.expiresAt <= startedAt) {
      const result = load().catch((error: unknown) => {
        if (entry?.result === result) entry = undefined;
        throw error;
      });
      entry = { expiresAt: startedAt + ttlMs, result };
    }
    const version = generation;
    try {
      const value = await entry.result;
      return version === generation ? copy(value) : readCached();
    } catch (error) {
      if (version !== generation) return readCached();
      throw error;
    }
  }
  return {
    read: load,
    readCached,
    invalidate: () => {
      generation++;
      entry = undefined;
    },
  };
}

/** One reader per configuration scope in each API runtime. */
export function createConfigReads(
  notifications?: ConfigNotifications,
  now = () => performance.now(),
) {
  const invalidate = new Map<ConfigScope, () => void>();
  const unsubscribe = notifications?.subscribe(
    ({ scope }) => invalidate.get(scope)?.(),
    () => {
      for (const reset of invalidate.values()) reset();
    },
  );
  return {
    source<T>(scope: ConfigScope, load: () => Promise<T>, copy = (value: T) => value) {
      if (invalidate.has(scope)) throw new Error(`Configuration reader already exists: ${scope}`);
      const reader = createReader(load, copy, now);
      invalidate.set(scope, reader.invalidate);
      return { read: reader.read, readCached: reader.readCached };
    },
    committed(scope: ConfigScope, revision: number) {
      invalidate.get(scope)?.();
      notifications?.publish({ scope, revision });
    },
    close: () => {
      unsubscribe?.();
      for (const reset of invalidate.values()) reset();
    },
  };
}

export type ConfigReads = ReturnType<typeof createConfigReads>;
