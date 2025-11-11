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
import { pick } from "lodash-es";

export const CLIENT_PREFIX = "VITE_";
type ClientPrefix = typeof CLIENT_PREFIX;

export { z } from "zod";

/**
 * Create a new environment variable schema.
 */
export function createEnv<
  TServer extends ServerFormat = NonNullable<unknown>,
  TClient extends ClientFormat = NonNullable<unknown>,
  TShared extends SharedFormat = NonNullable<unknown>,
  const TExtends extends ExtendsFormat = [],
  TFinalSchema extends Schema = FinalSchema<TShared, TServer, TClient, TExtends>,
>(
  opts: Omit<
    EnvOptions<ClientPrefix, TShared, TServer, TClient, TExtends>,
    "clientPrefix" | "envStrict" | "env"
  >,
): DefineEnv<TFinalSchema> {
  const client = typeof opts.client === "object" ? opts.client : {};
  const server = typeof opts.server === "object" ? opts.server : {};
  const shared = opts.shared;
  const isServer =
    opts.isServer ?? (typeof window === "undefined" || import.meta?.env?.SSR || "Deno" in window);

  const runtimeEnv = {
    ...(!isServer ? pick(process.env, Object.keys(shared ?? {})) : process.env),
    ...import.meta?.env,
  };

  return defineEnvCore<ClientPrefix, TShared, TServer, TClient, TExtends, TFinalSchema>({
    skip: opts.skip,
    shared,
    client,
    server,
    isServer,
    env: runtimeEnv,
    clientPrefix: "VITE_",
  });
}

export { defineEnvCore };
