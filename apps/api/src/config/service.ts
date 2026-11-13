import type { AuditService } from "../administration/audit.js";
import { hasPermission } from "@raypx/account/access";
import type { AccessPolicy } from "../access.js";
import { configurationSnapshotSchema, configurationUpdateSchema } from "@raypx/contracts/api";
import { createConfigurationReads, type ConfigurationReads } from "./reads.js";
import type { ConfigurationRepository, ConfigurationService } from "./types.js";

export class ConfigurationError extends Error {
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

export interface ConfigurationServiceOptions {
  repository: ConfigurationRepository;
  audit?: AuditService;
  access: AccessPolicy;
  reads?: ConfigurationReads;
}

export function createConfigurationService({
  repository,
  audit,
  access,
  reads = createConfigurationReads(),
}: ConfigurationServiceOptions): ConfigurationService {
  async function read() {
    try {
      return configurationSnapshotSchema.parse(await repository.read());
    } catch {
      throw new ConfigurationError("CONFIGURATION_UNAVAILABLE");
    }
  }
  const service: ConfigurationService = {
    ...reads.source("site", read, (snapshot) => structuredClone(snapshot)),
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
