import type { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { storageConfiguration } from "@raypx/database/schema";
import { createS3Storage } from "@raypx/storage/s3";
import {
  storageCredentialsSchema,
  storageLocationSchema,
  type StorageSettingsSnapshot,
} from "@raypx/contracts/api";
import type { StorageSettingsService } from "../configuration/types.js";
import { ConfigurationError } from "../configuration/service.js";
import { createConfigurationReads, type ConfigurationReads } from "../configuration/reads.js";
import { configurationCipher } from "../configuration/credentials.js";
import { AuditUnavailable, type AuditService } from "../administration/audit.js";
import { writeAuditSuccess } from "../administration/repository.js";

const safeStorageLocationSchema = storageLocationSchema.extend({
  endpoint: storageLocationSchema.shape.endpoint.refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      (url.protocol === "https:" || (loopback && url.protocol === "http:")) &&
      url.pathname === "/" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }),
});
export const storageConfigSchema = safeStorageLocationSchema.extend({
  ...storageCredentialsSchema.shape,
  region: storageLocationSchema.shape.region.default("auto"),
});

const id = "s3";
const purpose = "raypx/storage-configuration/v1";
type Location = { endpoint: string; bucket: string; region: string };

function associatedData({ endpoint, bucket, region }: Location) {
  return JSON.stringify([endpoint, bucket, region]);
}

async function sealCredentials(
  secret: string,
  location: Location,
  credentials: z.infer<typeof storageCredentialsSchema>,
) {
  return configurationCipher(secret, purpose, id).seal(
    JSON.stringify(credentials),
    associatedData(location),
  );
}

export async function saveStorageConfiguration(
  db: Database,
  secret: string,
  input: z.output<typeof storageConfigSchema>,
) {
  const { accessKeyId, secretAccessKey, endpoint, bucket, region } = input;
  const location = { endpoint, bucket, region };
  const credentials = await sealCredentials(secret, location, { accessKeyId, secretAccessKey });
  await db
    .insert(storageConfiguration)
    .values({ id, ...location, credentials })
    .onConflictDoUpdate({
      target: storageConfiguration.id,
      set: {
        ...location,
        credentials,
        updatedAt: sql`now()`,
        revision: sql`${storageConfiguration.revision} + 1`,
      },
    });
}

/** Each upload observes the current database configuration. Credentials stay in the API process. */
export function databaseStorage(db: Database, secret: string, reads = createConfigurationReads()) {
  return reads.source("storage", async () => {
    const [row] = await db
      .select()
      .from(storageConfiguration)
      .where(eq(storageConfiguration.id, id));
    if (!row?.enabled) return null;
    const { endpoint, bucket, region } = row;
    const location = { endpoint, bucket, region };
    const cleartext = await configurationCipher(secret, purpose, id).open(
      row.credentials,
      associatedData(location),
    );
    const credentials = storageCredentialsSchema.parse(JSON.parse(cleartext));
    return createS3Storage(storageConfigSchema.parse({ ...location, ...credentials }));
  });
}

type StorageSummary = Pick<
  typeof storageConfiguration.$inferSelect,
  "endpoint" | "bucket" | "region" | "enabled" | "revision" | "updatedAt"
>;
function snapshot(row: StorageSummary | undefined): StorageSettingsSnapshot {
  if (!row) return { values: null, revision: 0, updatedAt: null };
  const { endpoint, bucket, region, enabled, revision, updatedAt } = row;
  return {
    values: { endpoint, bucket, region, enabled },
    revision,
    updatedAt: updatedAt.toISOString(),
  };
}

function canSetEndpoint(endpoint: string, previous: string | undefined) {
  if (endpoint === previous) return true;
  const url = new URL(endpoint);
  return (
    url.protocol === "https:" &&
    !url.port &&
    (/^s3(?:[.-][a-z]{2}(?:-[a-z0-9]+)+-\d+)?\.amazonaws\.com(?:\.cn)?$/.test(url.hostname) ||
      /^[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/.test(url.hostname))
  );
}

export function createStorageSettings(
  db: Database,
  secret: string,
  audit: AuditService,
  reads: ConfigurationReads,
): StorageSettingsService {
  return {
    async read() {
      try {
        const [row] = await db
          .select({
            endpoint: storageConfiguration.endpoint,
            bucket: storageConfiguration.bucket,
            region: storageConfiguration.region,
            enabled: storageConfiguration.enabled,
            revision: storageConfiguration.revision,
            updatedAt: storageConfiguration.updatedAt,
          })
          .from(storageConfiguration)
          .where(eq(storageConfiguration.id, id));
        return snapshot(row);
      } catch {
        throw new ConfigurationError("CONFIGURATION_UNAVAILABLE");
      }
    },
    async update({ values: { enabled, ...location }, credentials, revision }) {
      const parsed = safeStorageLocationSchema.safeParse(location);
      if (!parsed.success) throw new ConfigurationError("INVALID_INPUT");
      const values = { ...parsed.data, enabled };
      const scope = audit.current();
      if (!scope || scope.action !== "configuration.update") throw new AuditUnavailable();
      scope.mutationStarted = true;
      let result: StorageSettingsSnapshot;
      try {
        result = await db.transaction(async (tx) => {
          const [previous] = await tx
            .select()
            .from(storageConfiguration)
            .where(eq(storageConfiguration.id, id))
            .for("update");
          if ((previous?.revision ?? 0) !== revision)
            throw new ConfigurationError("CONFIGURATION_CONFLICT");
          if (!canSetEndpoint(values.endpoint, previous?.endpoint))
            throw new ConfigurationError("STORAGE_ENDPOINT_REQUIRES_OPERATOR");
          const changedLocation =
            !previous ||
            values.endpoint !== previous.endpoint ||
            values.region !== previous.region ||
            values.bucket !== previous.bucket;
          if (changedLocation && !credentials) throw new ConfigurationError("INVALID_INPUT");
          const encrypted = credentials
            ? await sealCredentials(secret, values, credentials)
            : previous!.credentials;
          const next = {
            ...values,
            credentials: encrypted,
            revision: revision + 1,
            updatedAt: sql`now()`,
          };
          const [row] = previous
            ? await tx
                .update(storageConfiguration)
                .set(next)
                .where(
                  and(eq(storageConfiguration.id, id), eq(storageConfiguration.revision, revision)),
                )
                .returning()
            : await tx
                .insert(storageConfiguration)
                .values({ id, ...next })
                .onConflictDoNothing()
                .returning();
          if (!row) throw new ConfigurationError("CONFIGURATION_CONFLICT");
          await writeAuditSuccess(tx, scope, {
            targetId: id,
            before: previous ? { storageEnabled: previous.enabled } : null,
            after: { storageEnabled: row.enabled },
          });
          return snapshot(row);
        });
      } catch (error) {
        if (error instanceof ConfigurationError || error instanceof AuditUnavailable) throw error;
        throw new ConfigurationError("CONFIGURATION_UNAVAILABLE");
      }
      scope.committed = true;
      reads.committed("storage", result.revision);
      return result;
    },
  };
}
