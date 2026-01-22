import { defineEnv as defineEnvCore } from "envin";
import type {
  ClientFormat,
  DefineEnv,
  EnvOptions,
  ExtendsFormat,
  FinalSchema,
  Schema,
  ServerFormat,
  SharedFormat,
} from "envin/types";
import { pick } from "radash";

/**
 * Default client prefix for Vite projects
 */
export const DEFAULT_CLIENT_PREFIX = "VITE_";

/**
 * Options for createEnv with configurable client prefix (defaults to VITE_)
 */
export type CreateEnvOptions<
  TPrefix extends string,
  TShared extends SharedFormat,
  TServer extends ServerFormat,
  TClient extends ClientFormat,
  TExtends extends ExtendsFormat,
> = Omit<EnvOptions<TPrefix, TShared, TServer, TClient, TExtends>, "envStrict" | "env"> & {
  /**
   * Client prefix for environment variables (default: "VITE_")
   */
  clientPrefix?: TPrefix;
};

/**
 * Safely get import.meta.env if available (Vite environment)
 */
function getImportMetaEnv(): Record<string, string | undefined> {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env) {
      return import.meta.env as Record<string, string | undefined>;
    }
  } catch {
    // import.meta not available
  }
  return {};
}

/**
 * Check if running on server side
 */
function detectIsServer(): boolean {
  // Check window availability
  if (typeof window === "undefined") {
    return true;
  }

  // Check Deno
  if ("Deno" in window) {
    return true;
  }

  // Check Vite SSR flag
  const metaEnv = getImportMetaEnv();
  if (metaEnv.SSR) {
    return true;
  }

  return false;
}

/**
 * Create a new environment variable schema with configurable client prefix (defaults to VITE_).
 *
 * @example
 * ```typescript
 * // Using default VITE_ prefix
 * const env = createEnv({
 *   server: { DATABASE_URL: z.string().url() },
 *   client: { VITE_APP_URL: z.string().url() },
 * });
 *
 * // Using custom prefix
 * const env = createEnv({
 *   clientPrefix: "NEXT_PUBLIC_",
 *   server: { DATABASE_URL: z.string().url() },
 *   client: { NEXT_PUBLIC_APP_URL: z.string().url() },
 * });
 * ```
 */
export function createEnv<
  TPrefix extends string = typeof DEFAULT_CLIENT_PREFIX,
  TServer extends ServerFormat = NonNullable<unknown>,
  TClient extends ClientFormat = NonNullable<unknown>,
  TShared extends SharedFormat = NonNullable<unknown>,
  const TExtends extends ExtendsFormat = [],
  TFinalSchema extends Schema = FinalSchema<TShared, TServer, TClient, TExtends>,
>(opts: CreateEnvOptions<TPrefix, TShared, TServer, TClient, TExtends>): DefineEnv<TFinalSchema> {
  const client = typeof opts.client === "object" ? opts.client : {};
  const server = typeof opts.server === "object" ? opts.server : {};
  const shared = opts.shared;
  const clientPrefix = (opts.clientPrefix ?? DEFAULT_CLIENT_PREFIX) as TPrefix;
  const isServer = opts.isServer ?? detectIsServer();

  const metaEnv = getImportMetaEnv();

  // Build runtime environment
  // On client: only pick shared and client variables
  // On server: use full process.env
  const runtimeEnv = isServer
    ? { ...process.env, ...metaEnv }
    : {
        ...pick(process.env, [...Object.keys(shared ?? {}), ...Object.keys(client)]),
        ...metaEnv,
      };

  return defineEnvCore<TPrefix, TShared, TServer, TClient, TExtends, TFinalSchema>({
    skip: opts.skip,
    shared,
    client,
    server,
    isServer,
    env: runtimeEnv,
    clientPrefix,
    extends: opts.extends,
  });
}
export type {
  ClientFormat,
  DefineEnv,
  ExtendsFormat,
  FinalSchema,
  Schema,
  ServerFormat,
  SharedFormat,
};
