import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { migrateDatabase } from "@raypx/database";
import { resendUpdateSchema } from "@raypx/contracts/api";
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
  const { DATABASE_URL: url, AUTH_SECRET: secret } = env;
  if (!url || !URL.canParse(url) || !["postgres:", "postgresql:"].includes(new URL(url).protocol))
    throw new MigrationInputError("Set DATABASE_URL to the active Raypx foundation database.");

  const importConfig = values["import-config"] || env.DB_MIGRATE_IMPORT_CONFIG === "true";
  const mailPresent = importConfig && Boolean(env.RESEND_API_KEY || env.MAIL_FROM);
  const storagePresent =
    importConfig &&
    Boolean(env.S3_ENDPOINT || env.S3_BUCKET || env.S3_ACCESS_KEY_ID || env.S3_SECRET_ACCESS_KEY);
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
  if ((mail || storage) && (!secret || secret.length < 32))
    throw new MigrationInputError("Set the API deployment's AUTH_SECRET to import configuration.");

  await migrateDatabase(url, migrations, async (tx) => {
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
