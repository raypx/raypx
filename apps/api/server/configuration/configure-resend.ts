import { connectDatabase } from "@raypx/database/connection";
import { resendUpdateSchema } from "@raypx/contracts/api";
import { initializeResend } from "./resend.js";

try {
  const { DATABASE_URL: databaseUrl, AUTH_SECRET: secret } = process.env;
  if (!databaseUrl || !secret || secret.length < 32)
    throw new Error("Deployment configuration required");
  const input = resendUpdateSchema.parse({
    values: {
      from: process.env.MAIL_FROM,
      defaultLocale: process.env.MAIL_DEFAULT_LOCALE ?? "en",
      enabled: true,
    },
    apiKey: process.env.RESEND_API_KEY,
    revision: 0,
  });
  if (!input.apiKey) throw new Error("Resend key required");
  const connection = connectDatabase(databaseUrl);
  try {
    const created = await initializeResend(connection.db, secret, input.values, input.apiKey);
    console.log(created ? "Resend configuration saved." : "Resend configuration already exists.");
  } finally {
    await connection.close();
  }
} catch {
  console.error(
    "Unable to initialize Resend. Check the mail settings, deployment secret and migrated database.",
  );
  process.exitCode = 1;
}
