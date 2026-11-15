import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { sandboxConfiguration } from "@raypx/database/schema";
import {
  sandboxUpdateSchema,
  type SandboxSettingsSnapshot,
  type SandboxSettingsUpdate,
} from "@raypx/contracts/api";
import { testDockerComputerConnection } from "@raypx/providers/computer/docker";
import type { AuditService } from "../admin/audit.js";
import { configurationCipher } from "./credentials.js";
import { writeAuditedSetting } from "./audited-write.js";
import type { ConfigReads } from "./reads.js";
import { ConfigError } from "./service.js";
import type { SandboxSettingsService } from "./types.js";

const id = "sandbox";
export function sandboxCipher(secret: string) {
  return configurationCipher(secret, "raypx/sandbox-configuration/v1", id);
}
const summary = {
  provider: sandboxConfiguration.provider,
  url: sandboxConfiguration.url,
  screen: sandboxConfiguration.screen,
  hasCredential: sql<boolean>`${sandboxConfiguration.credentials} is not null`,
  revision: sandboxConfiguration.revision,
  updatedAt: sandboxConfiguration.updatedAt,
};
function snapshot(
  row:
    | {
        provider: "none" | "docker";
        url: string | null;
        screen: boolean;
        hasCredential: boolean;
        revision: number;
        updatedAt: Date;
      }
    | undefined,
): SandboxSettingsSnapshot {
  if (!row)
    return {
      values: { provider: "none", url: null, screen: false },
      hasCredential: false,
      revision: 0,
      updatedAt: null,
    };
  const { provider, url, screen, hasCredential, revision, updatedAt } = row;
  return {
    values: { provider, url, screen },
    hasCredential,
    revision,
    updatedAt: updatedAt.toISOString(),
  };
}
export async function initializeSandbox(
  db: Pick<Database, "insert">,
  secret: string,
  input: SandboxSettingsUpdate,
) {
  const { values, credential } = sandboxUpdateSchema.parse(input);
  if (values.provider === "docker" && !credential) throw new ConfigError("INVALID_INPUT");
  const credentials = credential
    ? await sandboxCipher(secret).seal(credential, values.url ?? "")
    : null;
  await db
    .insert(sandboxConfiguration)
    .values({ id, ...values, credentials, revision: 1 })
    .onConflictDoNothing();
}
export function createSandboxSettings(
  db: Database,
  secret: string,
  audit: AuditService,
  reads: ConfigReads,
  forbiddenCredentials: readonly string[] = [secret],
): SandboxSettingsService {
  const cipher = sandboxCipher(secret);
  return {
    async read() {
      try {
        const [row] = await db
          .select(summary)
          .from(sandboxConfiguration)
          .where(eq(sandboxConfiguration.id, id));
        return snapshot(row);
      } catch {
        throw new ConfigError("CONFIGURATION_UNAVAILABLE");
      }
    },
    async update(input) {
      const parsed = sandboxUpdateSchema.safeParse(input);
      if (!parsed.success) throw new ConfigError("INVALID_INPUT");
      const { values, credential, revision } = parsed.data;
      if (credential && forbiddenCredentials.includes(credential))
        throw new ConfigError("INVALID_INPUT");
      return writeAuditedSetting({ db, audit, reads, scope: "sandbox" }, async (tx) => {
        const [previous] = await tx
          .select()
          .from(sandboxConfiguration)
          .where(eq(sandboxConfiguration.id, id))
          .for("update");
        if ((previous?.revision ?? 0) !== revision) throw new ConfigError("CONFIGURATION_CONFLICT");
        // Never send a retained credential to a newly selected origin.
        if (previous?.url !== values.url && previous?.credentials && !credential)
          throw new ConfigError("INVALID_INPUT");
        const credentials = credential
          ? await cipher.seal(credential, values.url ?? "")
          : (previous?.credentials ?? null);
        if (values.provider === "docker" && !credentials) throw new ConfigError("INVALID_INPUT");
        const next = { ...values, credentials, revision: revision + 1, updatedAt: sql`now()` };
        const [row] = previous
          ? await tx
              .update(sandboxConfiguration)
              .set(next)
              .where(
                and(eq(sandboxConfiguration.id, id), eq(sandboxConfiguration.revision, revision)),
              )
              .returning(summary)
          : await tx
              .insert(sandboxConfiguration)
              .values({ id, ...next })
              .onConflictDoNothing()
              .returning(summary);
        if (!row) throw new ConfigError("CONFIGURATION_CONFLICT");
        return {
          snapshot: snapshot(row),
          changes: {
            targetId: id,
            before: previous ? { sandboxEnabled: previous.provider !== "none" } : null,
            after: { sandboxEnabled: row.provider !== "none" },
          },
        };
      });
    },
    async test() {
      try {
        const [row] = await db
          .select()
          .from(sandboxConfiguration)
          .where(eq(sandboxConfiguration.id, id));
        if (!row || row.provider === "none" || !row.url || !row.credentials)
          return { status: "not-configured" };
        return await testDockerComputerConnection({
          url: row.url,
          token: await cipher.open(row.credentials, row.url),
        });
      } catch {
        return { status: "unavailable" };
      }
    },
  };
}
