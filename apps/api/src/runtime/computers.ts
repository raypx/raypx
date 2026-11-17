import type { ApiEnvironment, WorkerEnvironment } from "../env.js";
export type AgentEnvironment = Omit<WorkerEnvironment, "_schema" | "REDIS_URL"> & {
  REDIS_URL?: string | undefined;
} & Partial<Omit<ApiEnvironment, "_schema">>;

/** Known deployment secrets stay in the backend and fail closed at the tool boundary. */
export function knownComputerSecrets(environment: AgentEnvironment): string[] {
  let credentials: unknown;
  try {
    credentials = JSON.parse(environment.AGENT_MODEL_CREDENTIALS);
    if (
      !credentials ||
      typeof credentials !== "object" ||
      Array.isArray(credentials) ||
      Object.values(credentials).some((value) => typeof value !== "string" || !value)
    )
      throw new Error();
  } catch {
    throw new Error("Invalid deployment model configuration");
  }
  const connectionPasswords = [environment.DATABASE_URL, environment.REDIS_URL].flatMap((value) => {
    if (!value) return [];
    const password = new URL(value).password;
    return password ? [password, decodeURIComponent(password)] : [];
  });
  return [
    ...connectionPasswords,
    ...Object.values(credentials as Record<string, string>),
    environment.AUTH_SECRET,
    environment.APP_KEY,
    environment.BROWSER_BROKER_TOKEN,
    environment.ROUTINE_EMAIL_RELAY_TOKEN,
    environment.GOOGLE_CLIENT_SECRET,
    environment.GITHUB_CLIENT_SECRET,
    environment.AUTH_TURNSTILE_SECRET_KEY,
    environment.POSTHOG_PROJECT_TOKEN,
    environment.DATABASE_URL,
    environment.REDIS_URL,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}
