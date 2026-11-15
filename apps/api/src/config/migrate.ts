import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { migrateDatabase } from "@raypx/database";
import { initializeSandbox } from "./sandbox.js";
import { sandboxUpdateSchema, resendUpdateSchema } from "@raypx/contracts/api";
import { configureRuntimeRole } from "./migration-runtime-role.js";
import { initializeResend } from "./resend.js";
import { saveStorageConfiguration, storageConfigSchema } from "../storage/config.js";

const migrations = fileURLToPath(
  new URL("../../../../packages/database/drizzle-foundation", import.meta.url),
);
const usage = "Usage: bun run db:migrate [--import-config] [--storage-stdin]";

class MigrationInputError extends Error {}

function flags() {
  try {
    return parseArgs({
      options: {
        "import-config": { type: "boolean" },
        "storage-stdin": { type: "boolean" },
        help: { type: "boolean" },
      },
    }).values;
  } catch {
    throw new MigrationInputError(usage);
  }
}

async function migrate() {
  const values = flags();
  if (values.help) {
    console.log(usage);
    return;
  }
  const env = process.env;
  const { DATABASE_URL: url, APP_KEY: secret } = env;
  if (!url || !URL.canParse(url) || !["postgres:", "postgresql:"].includes(new URL(url).protocol))
    throw new MigrationInputError("Set DATABASE_URL to the active Raypx foundation database.");

  const runtimeUser = env.DB_MIGRATE_RUNTIME_USER;
  const runtimePassword = env.DB_MIGRATE_RUNTIME_PASSWORD;
  if (Boolean(runtimeUser) !== Boolean(runtimePassword))
    throw new MigrationInputError(
      "Set both DB_MIGRATE_RUNTIME_USER and DB_MIGRATE_RUNTIME_PASSWORD.",
    );
  if (runtimeUser && runtimeUser === decodeURIComponent(new URL(url).username))
    throw new MigrationInputError("The database runtime role must differ from the migration role.");

  const importConfig = values["import-config"] || env.DB_MIGRATE_IMPORT_CONFIG === "true";
  const mailPresent = importConfig && Boolean(env.RESEND_API_KEY || env.MAIL_FROM);
  const storagePresent =
    importConfig &&
    Boolean(env.S3_ENDPOINT || env.S3_BUCKET || env.S3_ACCESS_KEY_ID || env.S3_SECRET_ACCESS_KEY);
  const sandboxPresent =
    importConfig &&
    Boolean(
      env.COMPUTER_PROVIDER ||
      env.SANDBOX_SUPERVISOR_URL ||
      env.SANDBOX_SUPERVISOR_TOKEN ||
      env.COMPUTER_SCREEN_ENABLED,
    );
  const sandbox = sandboxPresent
    ? sandboxUpdateSchema.safeParse({
        values: {
          provider: env.COMPUTER_PROVIDER || "none",
          url: env.SANDBOX_SUPERVISOR_URL || null,
          screen: env.COMPUTER_SCREEN_ENABLED === "true",
        },
        ...(env.SANDBOX_SUPERVISOR_TOKEN ? { credential: env.SANDBOX_SUPERVISOR_TOKEN } : {}),
        revision: 0,
      })
    : undefined;
  if (
    sandbox &&
    (!sandbox.success ||
      (sandbox.data.values.provider === "docker" && !sandbox.data.credential) ||
      (env.COMPUTER_SCREEN_ENABLED && !["true", "false"].includes(env.COMPUTER_SCREEN_ENABLED)) ||
      (sandbox.data.credential &&
        Object.entries(env).some(
          ([key, value]) =>
            key !== "SANDBOX_SUPERVISOR_TOKEN" &&
            value &&
            (value === sandbox.data.credential ||
              value.includes(JSON.stringify(sandbox.data.credential))),
        )))
  )
    throw new MigrationInputError(
      "Provide a supervisor URL and dedicated credential to import sandbox configuration.",
    );
  const storageStdin = values["storage-stdin"];
  const mail = mailPresent
    ? resendUpdateSchema.safeParse({
        values: {
          from: env.MAIL_FROM,
          defaultLocale: env.MAIL_DEFAULT_LOCALE || "en",
          enabled: true,
        },
        apiKey: env.RESEND_API_KEY,
        revision: 0,
      })
    : undefined;
  if (mail && (!mail.success || !mail.data.apiKey))
    throw new MigrationInputError(
      "Set both RESEND_API_KEY and a valid MAIL_FROM to import Resend.",
    );
  let storageInput: unknown;
  if (storageStdin) {
    try {
      storageInput = await Bun.stdin.json();
    } catch {
      throw new MigrationInputError("Provide valid S3 JSON on standard input.");
    }
  } else if (storagePresent) {
    storageInput = {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION || "auto",
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    };
  }
  const storage =
    storageStdin || storagePresent ? storageConfigSchema.safeParse(storageInput) : undefined;
  if (storage && !storage.success)
    throw new MigrationInputError(
      "Provide an S3 endpoint, bucket, and both keys to import storage.",
    );
  if ((mail || storage || sandbox) && (!secret || secret.length < 32))
    throw new MigrationInputError("Set the API deployment's APP_KEY to import configuration.");

  await migrateDatabase(url, migrations, async (tx) => {
    if (runtimeUser && runtimePassword)
      await configureRuntimeRole(tx, runtimeUser, runtimePassword);
    if (sandbox?.success) await initializeSandbox(tx, secret!, sandbox.data);
    if (mail?.success && mail.data.apiKey)
      await initializeResend(tx, secret!, mail.data.values, mail.data.apiKey);
    if (storage?.success)
      await saveStorageConfiguration(
        tx,
        secret!,
        storage.data,
        storageStdin ? "replace" : "initialize",
      );
  });
  console.log("Database migration complete.");
}

try {
  await migrate();
} catch (error) {
  console.error(
    error instanceof MigrationInputError
      ? error.message
      : "Database migration failed. Check the database and migration configuration.",
  );
  process.exitCode = 1;
}
