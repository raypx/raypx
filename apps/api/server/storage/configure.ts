import { connectDatabase } from "@raypx/database/connection";
import { saveStorageConfiguration, storageConfigSchema } from "./configuration.js";

try {
  const { DATABASE_URL: databaseUrl, AUTH_SECRET: secret } = process.env;
  if (!databaseUrl || !secret || secret.length < 32)
    throw new Error("DATABASE_URL and the API's AUTH_SECRET are required.");
  const input = storageConfigSchema.safeParse(await Bun.stdin.json());
  if (!input.success) throw new Error("Invalid S3 configuration.");
  const connection = connectDatabase(databaseUrl);
  try {
    await saveStorageConfiguration(connection.db, secret, input.data);
    console.log("S3 configuration saved.");
  } finally {
    await connection.close();
  }
} catch {
  console.error(
    "Unable to save S3 configuration. Check the input, deployment secret and database.",
  );
  process.exitCode = 1;
}
