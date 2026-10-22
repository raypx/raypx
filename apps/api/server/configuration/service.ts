import type { AuthSession } from "@raypx/auth/types";
import { configurationSnapshotSchema, configurationUpdateSchema } from "@raypx/contracts/api";
import { createCache } from "../cache/cache.js";
import { createMemoryStore } from "../cache/memory.js";
import type { Cache } from "../cache/types.js";
import type { ConfigurationRepository, ConfigurationService } from "./types.js";

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
  /** Pass a longer-lived or shared cache; defaults to one private to this service. */
  cache?: Cache;
  /** How long readCached() may serve a snapshot; changes elsewhere apply within it. */
  cacheTtlMs?: number;
}

const CACHE_KEY = "configuration:snapshot";

export function createConfigurationService({
  repository,
  adminEmails,
  cache = createCache(createMemoryStore()),
  cacheTtlMs = 5_000,
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
  return {
    isAdmin,
    read,
    readCached: () =>
      cache.getOrLoad(
        CACHE_KEY,
        { ttlMs: cacheTtlMs, parse: (value) => configurationSnapshotSchema.parse(value) },
        read,
      ),
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
      await cache.set(CACHE_KEY, saved, cacheTtlMs);
      return saved;
    },
  };
}
