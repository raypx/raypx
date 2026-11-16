import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { sandboxConfiguration } from "@raypx/database/schema";
import {
  sandboxUpdateSchema,
  type SandboxSettingsSnapshot,
  type SandboxSettingsUpdate,
} from "@raypx/contracts/api";
import { testDockerComputerConnection } from "@raypx/providers/computer/docker";
import { testE2bConnection } from "@raypx/providers/computer/e2b";
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
export function sandboxCredentialTarget(row: { provider: string; url: string | null }) {
  if (row.provider === "e2b") return "e2b:https://api.e2b.app";
  return row.url ?? "";
}
const summary = {
  provider: sandboxConfiguration.provider,
  url: sandboxConfiguration.url,
  screen: sandboxConfiguration.screen,
  template: sandboxConfiguration.template,
  hasCredential: sql<boolean>`${sandboxConfiguration.credentials} is not null`,
  revision: sandboxConfiguration.revision,
  updatedAt: sandboxConfiguration.updatedAt,
};
function snapshot(
  row:
    | {
        provider: "none" | "docker" | "e2b";
        template: string | null;
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
  const { provider, url, screen, template, hasCredential, revision, updatedAt } = row;
  return {
    values: { provider, url, screen, ...(template ? { template } : {}) },
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
  if (values.provider !== "none" && !credential) throw new ConfigError("INVALID_INPUT");
  const credentials = credential
    ? await sandboxCipher(secret).seal(credential, sandboxCredentialTarget(values))
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
        if (
          previous?.credentials &&
          values.provider !== "none" &&
          sandboxCredentialTarget(previous) !== sandboxCredentialTarget(values) &&
          !credential
        )
          throw new ConfigError("INVALID_INPUT");
        const credentials = credential
          ? await cipher.seal(credential, sandboxCredentialTarget(values))
          : previous && sandboxCredentialTarget(previous) === sandboxCredentialTarget(values)
            ? previous.credentials
            : null;
        if (values.provider !== "none" && !credentials) throw new ConfigError("INVALID_INPUT");
        const next = {
          ...values,
          template: values.template ?? null,
          credentials,
          revision: revision + 1,
          updatedAt: sql`now()`,
        };
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
        if (!row || row.provider === "none" || !row.credentials)
          return { status: "not-configured" };
        const token = await cipher.open(row.credentials, sandboxCredentialTarget(row));
        if (row.provider === "e2b") {
          if (!row.template) return { status: "not-configured" };
          return await testE2bConnection(token, row.template);
        }
        if (!row.url) return { status: "not-configured" };
        return await testDockerComputerConnection({
          url: row.url,
          token,
        });
      } catch {
        return { status: "unavailable" };
      }
    },
  };
}
