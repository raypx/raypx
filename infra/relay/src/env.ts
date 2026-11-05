import { normalizeTrustedOrigins } from "@raypx/auth-model";
import { defineEnv, z } from "@raypx/env";

export function getRelayEnvironment(runtimeEnv: Record<string, string | undefined> = process.env) {
  const env = defineEnv({
    isServer: true,
    runtimeEnv,
    server: {
      NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
      HOST: z.string().min(1).default("127.0.0.1"),
      PORT: z.coerce.number().int().min(0).max(65535).default(3003),
      DATABASE_URL: z.url(),
      REDIS_URL: z.url(),
      ALLOWED_ORIGINS: z.string().min(1),
    },
  });
  if (!/^postgres(?:ql)?:$/.test(new URL(env.DATABASE_URL).protocol))
    throw new Error("Invalid Relay database protocol");
  if (!/^rediss?:$/.test(new URL(env.REDIS_URL).protocol))
    throw new Error("Invalid Relay broker protocol");
  if (env.ALLOWED_ORIGINS.includes("*")) throw new Error("Relay requires exact allowed origins");
  const allowedOrigins = normalizeTrustedOrigins(env.ALLOWED_ORIGINS.split(","));
  if (!allowedOrigins.length) throw new Error("Relay requires allowed origins");
  if (env.NODE_ENV === "production" && env.PORT === 0)
    throw new Error("Production Relay requires a fixed port");
  return { ...env, allowedOrigins };
}
export type RelayEnvironment = ReturnType<typeof getRelayEnvironment>;
