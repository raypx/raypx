import type { AuditService } from "../admin/audit.js";
import { hasPermission } from "@raypx/account/access";
import type { AccessPolicy } from "../access.js";
import { configurationSnapshotSchema, configurationUpdateSchema } from "@raypx/contracts/api";
import { createConfigReads, type ConfigReads } from "./reads.js";
import type { ConfigRepository, ConfigService } from "./types.js";

export class ConfigError extends Error {
  constructor(
    readonly code:
      | "CONFIGURATION_UNAVAILABLE"
      | "CONFIGURATION_CONFLICT"
      | "INVALID_INPUT"
      | "STORAGE_ENDPOINT_REQUIRES_OPERATOR"
      | "UNAUTHORIZED"
      | "FORBIDDEN",
  ) {
    super(code);
  }
}

export interface ConfigServiceOptions {
  repository: ConfigRepository;
  audit?: AuditService;
  access: AccessPolicy;
  reads?: ConfigReads;
}

export function createConfigService({
  repository,
  audit,
  access,
  reads = createConfigReads(),
}: ConfigServiceOptions): ConfigService {
  async function read() {
    try {
      return configurationSnapshotSchema.parse(await repository.read());
    } catch {
      throw new ConfigError("CONFIGURATION_UNAVAILABLE");
    }
  }
  const service: ConfigService = {
    ...reads.source("site", read, (snapshot) => structuredClone(snapshot)),
    async update(input, auth) {
      if (!auth) throw new ConfigError("UNAUTHORIZED");
      if (!hasPermission(access(auth), "configuration.update")) throw new ConfigError("FORBIDDEN");
      const parsed = configurationUpdateSchema.safeParse(input);
      if (!parsed.success) throw new ConfigError("INVALID_INPUT");
      let saved;
      try {
        const result = await repository.update(
          parsed.data.values,
          parsed.data.revision,
          auth.user.id,
        );
        saved = result === null ? null : configurationSnapshotSchema.parse(result);
      } catch {
        throw new ConfigError("CONFIGURATION_UNAVAILABLE");
      }
      if (!saved) throw new ConfigError("CONFIGURATION_CONFLICT");
      reads.committed("site", saved.revision);
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
