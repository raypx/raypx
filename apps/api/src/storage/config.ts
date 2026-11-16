import type { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { conversationAttachmentObjects, storageConfiguration } from "@raypx/database/schema";
import {
  storageCredentialsSchema,
  storageLocationSchema,
  type StorageSettingsSnapshot,
} from "@raypx/contracts/api";
import type { StorageSettingsService } from "../config/types.js";
import { ConfigError } from "../config/service.js";
import { type ConfigReads } from "../config/reads.js";
import { configurationCipher } from "../config/credentials.js";
import type { AuditService } from "../admin/audit.js";
import { writeAuditedSetting } from "../config/audited-write.js";
import { createS3ObjectStorage } from "@raypx/providers/object-storage";
import type { MessageAttachmentObjectStorage } from "@raypx/agents/server/postgres";

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

async function requireUnusedLocation(db: Pick<Database, "select">) {
  const [existing] = await db
    .select({ key: conversationAttachmentObjects.key })
    .from(conversationAttachmentObjects)
    .limit(1);
  if (existing) throw new ConfigError("STORAGE_LOCATION_IN_USE");
}

function sameLocation(left: Location, right: Location) {
  return (
    left.endpoint === right.endpoint && left.bucket === right.bucket && left.region === right.region
  );
}

export function createAttachmentObjectStorage(secret: string): MessageAttachmentObjectStorage {
  const cipher = configurationCipher(secret, purpose, id);
  async function client(db: Pick<Database, "select">) {
    const [row] = await db
      .select()
      .from(storageConfiguration)
      .where(eq(storageConfiguration.id, id));
    if (!row) throw new Error("OBJECT_STORAGE_UNAVAILABLE");
    const { endpoint, bucket, region } = row;
    const location = safeStorageLocationSchema.parse({ endpoint, bucket, region });
    const credentials = storageCredentialsSchema.parse(
      JSON.parse(await cipher.open(row.credentials, associatedData(location))),
    );
    return createS3ObjectStorage({ ...location, ...credentials });
  }
  return {
    async enabled(db) {
      const [row] = await db
        .select({ enabled: storageConfiguration.enabled })
        .from(storageConfiguration)
        .where(eq(storageConfiguration.id, id))
        .for("share");
      return row?.enabled ?? false;
    },
    async put(db, key, bytes) {
      await (await client(db)).put(key, bytes);
    },
    async read(db, key, size) {
      return (await client(db)).read(key, size);
    },
    async remove(db, key) {
      await (await client(db)).remove(key);
    },
  };
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
  db: Pick<Database, "insert" | "select">,
  secret: string,
  input: z.output<typeof storageConfigSchema>,
  mode: "replace" | "initialize" = "replace",
) {
  const { accessKeyId, secretAccessKey, endpoint, bucket, region } = input;
  const location = { endpoint, bucket, region };
  const credentials = await sealCredentials(secret, location, { accessKeyId, secretAccessKey });
  const insert = db.insert(storageConfiguration).values({ id, ...location, credentials });
  if (mode === "initialize") {
    await insert.onConflictDoNothing();
    return;
  }
  const [previous] = await db
    .select()
    .from(storageConfiguration)
    .where(eq(storageConfiguration.id, id))
    .for("update");
  if (previous && !sameLocation(previous, location)) await requireUnusedLocation(db);
  if (!previous) {
    const [saved] = await insert.onConflictDoNothing().returning({ id: storageConfiguration.id });
    if (!saved) throw new ConfigError("CONFIGURATION_CONFLICT");
    return;
  }
  await insert.onConflictDoUpdate({
    target: storageConfiguration.id,
    set: {
      ...location,
      credentials,
      updatedAt: sql`now()`,
      revision: sql`${storageConfiguration.revision} + 1`,
    },
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
  reads: ConfigReads,
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
        throw new ConfigError("CONFIGURATION_UNAVAILABLE");
      }
    },
    async update({ values: { enabled, ...location }, credentials, revision }) {
      const parsed = safeStorageLocationSchema.safeParse(location);
      if (!parsed.success) throw new ConfigError("INVALID_INPUT");
      const values = { ...parsed.data, enabled };
      return writeAuditedSetting({ db, audit, reads, scope: "storage" }, async (tx) => {
        const [previous] = await tx
          .select()
          .from(storageConfiguration)
          .where(eq(storageConfiguration.id, id))
          .for("update");
        if ((previous?.revision ?? 0) !== revision) throw new ConfigError("CONFIGURATION_CONFLICT");
        if (!canSetEndpoint(values.endpoint, previous?.endpoint))
          throw new ConfigError("STORAGE_ENDPOINT_REQUIRES_OPERATOR");
        const changedLocation = !previous || !sameLocation(values, previous);
        if (changedLocation && !credentials) throw new ConfigError("INVALID_INPUT");
        if (changedLocation) await requireUnusedLocation(tx);
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
        if (!row) throw new ConfigError("CONFIGURATION_CONFLICT");
        return {
          snapshot: snapshot(row),
          changes: {
            targetId: id,
            before: previous ? { storageEnabled: previous.enabled } : null,
            after: { storageEnabled: row.enabled },
          },
        };
      });
    },
  };
}
