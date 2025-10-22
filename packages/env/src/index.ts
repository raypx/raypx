/**
 * @fileoverview Environment validation with extends support
 * Forked from @t3-oss/t3-env
 */
import type {
  CreateEnv,
  CreateSchemaOptions,
  DefaultCombinedSchema,
  EmptyObject,
  ServerClientOptions,
  StandardSchemaDictionary,
  StandardSchemaV1,
  StrictOptions,
  TExtendsFormat,
} from "./core";
import { createEnv as createEnvCore } from "./core";

const CLIENT_PREFIX = "VITE_" as const;
type ClientPrefix = typeof CLIENT_PREFIX;

export { z } from "zod";

type Options<
  TServer extends StandardSchemaDictionary,
  TClient extends Record<`${ClientPrefix}${string}`, StandardSchemaV1>,
  TShared extends StandardSchemaDictionary,
  TExtends extends TExtendsFormat,
  TFinalSchema extends StandardSchemaV1<EmptyObject, EmptyObject>,
> = Omit<
  StrictOptions<ClientPrefix, TServer, TClient, TShared, TExtends> &
    ServerClientOptions<ClientPrefix, TServer, TClient> &
    CreateSchemaOptions<TServer, TClient, TShared, TFinalSchema>,
  "runtimeEnvStrict" | "runtimeEnv" | "clientPrefix"
>;

/**
 * Create a new environment variable schema.
 */
export function createEnv<
  TServer extends StandardSchemaDictionary = NonNullable<unknown>,
  TClient extends Record<`${ClientPrefix}${string}`, StandardSchemaV1> = NonNullable<unknown>,
  TShared extends StandardSchemaDictionary = NonNullable<unknown>,
  const TExtends extends TExtendsFormat = [],
  TFinalSchema extends StandardSchemaV1<EmptyObject, EmptyObject> = DefaultCombinedSchema<
    TServer,
    TClient,
    TShared
  >,
>(
  opts: Options<TServer, TClient, TShared, TExtends, TFinalSchema>,
): CreateEnv<TFinalSchema, TExtends> {
  const client = typeof opts.client === "object" ? opts.client : {};
  const server = typeof opts.server === "object" ? opts.server : {};
  const shared = opts.shared;

  const runtimeEnv = {
    ...(!import.meta.env.SSR ? {} : process.env),
    ...import.meta.env,
  };

  return createEnvCore<ClientPrefix, TServer, TClient, TShared, TExtends, TFinalSchema>({
    ...opts,
    shared,
    client,
    server,
    clientPrefix: CLIENT_PREFIX,
    runtimeEnv,
  });
}
