import type { AuditService } from "../administration/audit.ts";
import { hasPermission } from "@raypx/account/access";
import type { AccessPolicy } from "../access.ts";
import { configurationSnapshotSchema, configurationUpdateSchema } from "@raypx/contracts/api";
import { createCache } from "../cache/cache.ts";
import { createMemoryStore } from "../cache/memory.ts";
import type { Cache } from "../cache/types.ts";
import type { ConfigurationRepository, ConfigurationService } from "./types.ts";

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
  audit?: AuditService;
  access: AccessPolicy;
  /** Pass a longer-lived or shared cache; defaults to one private to this service. */
  cache?: Cache;
  /** How long readCached() may serve a snapshot; changes elsewhere apply within it. */
  cacheTtlMs?: number;
}

const CACHE_KEY = "configuration:snapshot";

export function createConfigurationService({
  repository,
  audit,
  access,
  cache = createCache(createMemoryStore()),
  cacheTtlMs = 5_000,
}: ConfigurationServiceOptions): ConfigurationService {
  async function read() {
    try {
      return configurationSnapshotSchema.parse(await repository.read());
    } catch {
      throw new ConfigurationError("CONFIGURATION_UNAVAILABLE");
    }
  }
  const service: ConfigurationService = {
    read,
    readCached: () =>
      cache.getOrLoad(
        CACHE_KEY,
        { ttlMs: cacheTtlMs, parse: (value) => configurationSnapshotSchema.parse(value) },
        read,
      ),
    async update(input, auth) {
      if (!auth) throw new ConfigurationError("UNAUTHORIZED");
      if (!hasPermission(access(auth), "configuration.update"))
        throw new ConfigurationError("FORBIDDEN");
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
  return !audit
    ? service
    : {
        ...service,
        update: (input, auth) =>
          !auth
            ? service.update(input, auth)
            : audit.run(
                {
                  action: "configuration.update",
                  actorId: auth.user.id,
                  source: "service",
                  requestId: crypto.randomUUID(),
                },
                () => service.update(input, auth),
              ),
      };
}
