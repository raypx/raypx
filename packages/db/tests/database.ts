import { connectDatabase, migrateDatabase } from "../src/connection.js";
export function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error("TEST_DATABASE_URL must name an isolated PostgreSQL test database.");
  const url = new URL(value);
  if (process.env.NODE_ENV !== "test" || !/^\/voidmix_[a-z0-9_]*test$/.test(url.pathname))
    throw new Error("Only a dedicated voidmix_*test database is allowed.");
  return value;
}
export async function openTestDatabase() {
  const url = testDatabaseUrl();
  await migrateDatabase(url);
  return connectDatabase(url);
}
