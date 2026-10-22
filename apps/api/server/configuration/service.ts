import type { AuthSession } from "@raypx/auth/types";
import {
  configurationSnapshotSchema,
  configurationUpdateSchema,
  type ConfigurationSnapshot,
} from "@raypx/contracts/api";
import type { ConfigurationCache, ConfigurationRepository, ConfigurationService } from "./types.js";

export class ConfigurationError extends Error {
  constructor(
    readonly code:
      | "CONFIGURATION_UNAVAILABLE"
      | "CONFIGURATION_CONFLICT"
      | "INVALID_INPUT"
      | "UNAUTHORIZED"
      | "FORBIDDEN",
  ) {
    super(code);
  }
}

export interface ConfigurationServiceOptions {
  repository: ConfigurationRepository;
  adminEmails: readonly string[];
  /** Pass a longer-lived holder to share cached reads across short-lived services. */
  cache?: ConfigurationCache;
  /** How long readCached() may serve a snapshot; changes elsewhere apply within it. */
  cacheTtlMs?: number;
  now?: () => number;
}

export function createConfigurationService({
  repository,
  adminEmails,
  cache = {},
  cacheTtlMs = 5_000,
  now = Date.now,
}: ConfigurationServiceOptions): ConfigurationService {
  const admins = new Set(adminEmails.map((email) => email.trim().toLowerCase()));
  const isAdmin = (auth: AuthSession | null) =>
    Boolean(
      auth?.user.emailVerified &&
      auth.session.userId === auth.user.id &&
      auth.session.expiresAt.getTime() > Date.now() &&
      admins.has(auth.user.email.toLowerCase()),
    );
  async function read() {
    try {
      return configurationSnapshotSchema.parse(await repository.read());
    } catch {
      throw new ConfigurationError("CONFIGURATION_UNAVAILABLE");
    }
  }
  function remember(snapshot: Promise<ConfigurationSnapshot>) {
    const entry = { snapshot, expiresAt: now() + cacheTtlMs };
    cache.entry = entry;
    // A failed read must not be served until it expires.
    snapshot.catch(() => {
      if (cache.entry === entry) delete cache.entry;
    });
    return snapshot;
  }
  return {
    isAdmin,
    read,
    async readCached() {
      const entry = cache.entry;
      // Callers receive copies so a caller mutation never reaches the cache.
      const snapshot = entry && entry.expiresAt > now() ? entry.snapshot : remember(read());
      return structuredClone(await snapshot);
    },
    async update(input, auth) {
      if (!auth) throw new ConfigurationError("UNAUTHORIZED");
      if (!isAdmin(auth)) throw new ConfigurationError("FORBIDDEN");
      const parsed = configurationUpdateSchema.safeParse(input);
      if (!parsed.success) throw new ConfigurationError("INVALID_INPUT");
      let saved;
      try {
        const result = await repository.update(
          parsed.data.values,
          parsed.data.revision,
          auth.user.id,
        );
        saved = result === null ? null : configurationSnapshotSchema.parse(result);
      } catch {
        throw new ConfigurationError("CONFIGURATION_UNAVAILABLE");
      }
      if (!saved) throw new ConfigurationError("CONFIGURATION_CONFLICT");
      void remember(Promise.resolve(structuredClone(saved)));
      return saved;
    },
  };
}
