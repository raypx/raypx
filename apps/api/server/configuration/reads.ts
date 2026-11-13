export const configurationScopes = ["site", "storage", "resend"] as const;
export type ConfigurationScope = (typeof configurationScopes)[number];
type ConfigurationChange = { scope: ConfigurationScope; revision: number };

export interface ConfigurationNotifications {
  publish(change: ConfigurationChange): void;
  subscribe(receive: (change: ConfigurationChange) => void, resubscribed: () => void): () => void;
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
export function createConfigurationReads(
  notifications?: ConfigurationNotifications,
  now = () => performance.now(),
) {
  const invalidate = new Map<ConfigurationScope, () => void>();
  const unsubscribe = notifications?.subscribe(
    ({ scope }) => invalidate.get(scope)?.(),
    () => {
      for (const reset of invalidate.values()) reset();
    },
  );
  return {
    source<T>(scope: ConfigurationScope, load: () => Promise<T>, copy = (value: T) => value) {
      if (invalidate.has(scope)) throw new Error(`Configuration reader already exists: ${scope}`);
      const reader = createReader(load, copy, now);
      invalidate.set(scope, reader.invalidate);
      return { read: reader.read, readCached: reader.readCached };
    },
    committed(scope: ConfigurationScope, revision: number) {
      invalidate.get(scope)?.();
      notifications?.publish({ scope, revision });
    },
    close: () => {
      unsubscribe?.();
      for (const reset of invalidate.values()) reset();
    },
  };
}

export type ConfigurationReads = ReturnType<typeof createConfigurationReads>;
