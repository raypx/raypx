export interface RelaySecrets {
  DATABASE_URL: string;
  REDIS_URL: string;
  ALLOWED_ORIGINS: string;
}

// Cloudflare reaches these services over the public network. Do not allow an
// accidentally plaintext URL or a PostgreSQL URL that disables verification.
export function containerEnvironment(env: RelaySecrets): Record<string, string> {
  try {
    const database = new URL(env.DATABASE_URL);
    const redis = new URL(env.REDIS_URL);
    if (
      !["postgres:", "postgresql:"].includes(database.protocol) ||
      database.searchParams.get("sslmode") !== "verify-full" ||
      redis.protocol !== "rediss:" ||
      !database.hostname ||
      !redis.hostname
    )
      throw new Error();
    allowedOrigins(env.ALLOWED_ORIGINS);
  } catch {
    throw new Error("Relay requires verified TLS database/Redis URLs and exact HTTPS origins");
  }
  return {
    NODE_ENV: "production",
    SERVER_ROLE: "relay",
    NITRO_HOST: "0.0.0.0",
    NITRO_PORT: "3002",
    DATABASE_URL: env.DATABASE_URL,
    REDIS_URL: env.REDIS_URL,
    ALLOWED_ORIGINS: env.ALLOWED_ORIGINS,
  };
}

export function allowedOrigins(value: string): Set<string> {
  const origins = value.split(",").map((origin) => origin.trim());
  if (!origins.length || origins.some((origin) => !origin)) throw new Error("Invalid origins");
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" || parsed.origin !== origin || parsed.hostname.includes("*"))
      throw new Error("Invalid origins");
  }
  return new Set(origins);
}
