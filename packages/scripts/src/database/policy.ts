import type { DatabaseScriptsEnvironment } from "../env.js";

export function requireDatabaseUrl(environment: DatabaseScriptsEnvironment): string {
  const value = environment.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required.");
  return value;
}

export function assertDevelopmentDatabaseCommand(
  command: string,
  environment: DatabaseScriptsEnvironment,
): void {
  if (environment.NODE_ENV !== "development" && environment.NODE_ENV !== "test") {
    throw new Error(`${command} is restricted to development and test environments.`);
  }
}
