import { and, eq, sql } from "drizzle-orm";
import type { ResendSettingsSnapshot, ResendSettingsUpdate } from "@raypx/contracts/api";
import type { Database } from "@raypx/database/connection";
import { mailConfiguration } from "@raypx/database/schema";
import { createMailer, MailUnavailableError, type Mailer } from "@raypx/email/server";
import { AuditUnavailable, type AuditService } from "../administration/audit.js";
import { writeAuditSuccess } from "../administration/repository.js";
import { configurationCipher } from "./credentials.js";
import { ConfigurationError } from "./service.js";
import { createConfigurationReads, type ConfigurationReads } from "./reads.js";
import type { ResendSettingsService } from "./types.js";

const id = "resend";
const purpose = "raypx/mail-configuration/v1";
const summary = {
  from: mailConfiguration.from,
  defaultLocale: mailConfiguration.defaultLocale,
  enabled: mailConfiguration.enabled,
  revision: mailConfiguration.revision,
  updatedAt: mailConfiguration.updatedAt,
};

function snapshot(
  row: Pick<typeof mailConfiguration.$inferSelect, keyof typeof summary> | undefined,
): ResendSettingsSnapshot {
  if (!row) return { values: null, revision: 0, updatedAt: null };
  const { from, defaultLocale, enabled, revision, updatedAt } = row;
  return { values: { from, defaultLocale, enabled }, revision, updatedAt: updatedAt.toISOString() };
}

/** Explicit bootstrap for deployments without an administrator session yet. */
export async function initializeResend(
  db: Database,
  secret: string,
  values: ResendSettingsUpdate["values"],
  apiKey: string,
) {
  const credentials = await configurationCipher(secret, purpose, id).seal(apiKey, values.from);
  const [row] = await db
    .insert(mailConfiguration)
    .values({ id, ...values, credentials, revision: 1 })
    .onConflictDoNothing()
    .returning({ id: mailConfiguration.id });
  return Boolean(row);
}

export function createResendSettings(
  db: Database,
  secret: string,
  audit: AuditService,
  reads: ConfigurationReads,
): ResendSettingsService {
  const cipher = configurationCipher(secret, purpose, id);
  return {
    async read() {
      try {
        const [row] = await db
          .select(summary)
          .from(mailConfiguration)
          .where(eq(mailConfiguration.id, id));
        return snapshot(row);
      } catch {
        throw new ConfigurationError("CONFIGURATION_UNAVAILABLE");
      }
    },
    async update({ values, apiKey, revision }) {
      const scope = audit.current();
      if (!scope || scope.action !== "configuration.update") throw new AuditUnavailable();
      scope.mutationStarted = true;
      let result: ResendSettingsSnapshot;
      try {
        result = await db.transaction(async (tx) => {
          const [previous] = await tx
            .select()
            .from(mailConfiguration)
            .where(eq(mailConfiguration.id, id))
            .for("update");
          if ((previous?.revision ?? 0) !== revision)
            throw new ConfigurationError("CONFIGURATION_CONFLICT");
          if (!previous && !apiKey) throw new ConfigurationError("INVALID_INPUT");
          let credentials = previous?.credentials ?? "";
          if (apiKey) credentials = await cipher.seal(apiKey, values.from);
          else if (previous && previous.from !== values.from)
            credentials = await cipher.seal(
              await cipher.open(credentials, previous.from),
              values.from,
            );
          const next = { ...values, credentials, revision: revision + 1, updatedAt: sql`now()` };
          const [row] = previous
            ? await tx
                .update(mailConfiguration)
                .set(next)
                .where(and(eq(mailConfiguration.id, id), eq(mailConfiguration.revision, revision)))
                .returning(summary)
            : await tx
                .insert(mailConfiguration)
                .values({ id, ...next })
                .onConflictDoNothing()
                .returning(summary);
          if (!row) throw new ConfigurationError("CONFIGURATION_CONFLICT");
          await writeAuditSuccess(tx, scope, {
            targetId: id,
            before: previous ? { mailEnabled: previous.enabled } : null,
            after: { mailEnabled: row.enabled },
          });
          return snapshot(row);
        });
      } catch (error) {
        if (error instanceof ConfigurationError || error instanceof AuditUnavailable) throw error;
        throw new ConfigurationError("CONFIGURATION_UNAVAILABLE");
      }
      scope.committed = true;
      reads.committed("resend", result.revision);
      return result;
    },
  };
}

/** Keep the live client process-local and reload it after a change or a short TTL. */
export function databaseMailer(
  db: Database,
  secret: string,
  reads = createConfigurationReads(),
  makeMailer = createMailer,
) {
  const cipher = configurationCipher(secret, purpose, id);

  const { readCached } = reads.source("resend", async (): Promise<Mailer | null> => {
    try {
      const [row] = await db.select().from(mailConfiguration).where(eq(mailConfiguration.id, id));
      if (!row?.enabled) return null;
      const apiKey = await cipher.open(row.credentials, row.from);
      return makeMailer({ apiKey, from: row.from, defaultLocale: row.defaultLocale });
    } catch {
      throw new MailUnavailableError();
    }
  });
  async function requireMailer() {
    const mailer = await readCached();
    if (!mailer) throw new MailUnavailableError();
    return mailer;
  }
  return {
    available: async () => readCached().then(Boolean, () => false),
    sendVerification: async (input) => (await requireMailer()).sendVerification(input),
    sendPasswordReset: async (input) => (await requireMailer()).sendPasswordReset(input),
  } satisfies Mailer & { available(): Promise<boolean> };
}
