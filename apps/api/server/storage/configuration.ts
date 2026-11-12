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
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const context = encoder.encode("raypx/storage-configuration/v1");
type Location = { endpoint: string; bucket: string; region: string };

async function encryptionKey(secret: string) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: context, info: encoder.encode(id) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function associatedData({ endpoint, bucket, region }: Location) {
  return encoder.encode(JSON.stringify([endpoint, bucket, region]));
}

async function sealCredentials(
  secret: string,
  location: Location,
  credentials: z.infer<typeof storageCredentialsSchema>,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: associatedData(location) },
    await encryptionKey(secret),
    encoder.encode(JSON.stringify(credentials)),
  );
  return Buffer.concat([iv, new Uint8Array(sealed)]).toString("base64");
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
export function databaseStorage(db: Database, secret: string) {
  return async () => {
    const [row] = await db
      .select()
      .from(storageConfiguration)
      .where(eq(storageConfiguration.id, id));
    if (!row?.enabled) return null;
    const { endpoint, bucket, region } = row;
    const location = { endpoint, bucket, region };
    const bytes = Uint8Array.from(Buffer.from(row.credentials, "base64"));
    const cleartext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, 12), additionalData: associatedData(location) },
      await encryptionKey(secret),
      bytes.subarray(12),
    );
    const credentials = storageCredentialsSchema.parse(JSON.parse(decoder.decode(cleartext)));
    return createS3Storage(storageConfigSchema.parse({ ...location, ...credentials }));
  };
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
      try {
        const result = await db.transaction(async (tx) => {
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
        scope.committed = true;
        return result;
      } catch (error) {
        if (error instanceof ConfigurationError || error instanceof AuditUnavailable) throw error;
        throw new ConfigurationError("CONFIGURATION_UNAVAILABLE");
      }
    },
  };
}
