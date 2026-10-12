import type z from "zod";

type Merge<Left, Right> = Omit<Left, keyof Right> & Right;
type OwnShape<Value, Key extends string> =
  Value extends Record<Key, infer Shape extends z.ZodRawShape> ? Shape : {};
type PresetShape<Value> = Merge<
  OwnShape<Value, "shared">,
  Merge<OwnShape<Value, "server">, OwnShape<Value, "client">>
>;
type ResolvePreset<Value> = Merge<
  ResolvePresets<Value extends { extends: infer Parents extends ExtendsFormat } ? Parents : []>,
  PresetShape<Value>
>;
type ResolvePresets<
  Values extends ExtendsFormat,
  Accumulator extends z.ZodRawShape = {},
> = Values extends readonly [infer Head, ...infer Tail extends ExtendsFormat]
  ? ResolvePresets<Tail, Merge<Accumulator, ResolvePreset<Head>>>
  : Accumulator;

export type PrefixFormat = string | undefined;
export type SharedFormat = z.ZodRawShape;
export type ServerFormat = z.ZodRawShape;
export type ClientFormat = z.ZodRawShape;
export type Schema = z.ZodType<object>;
export type ExtendsFormat = readonly Preset[];

export type Preset<
  Prefix extends PrefixFormat = PrefixFormat,
  Shared extends SharedFormat = SharedFormat,
  Server extends ServerFormat = ServerFormat,
  Client extends ClientFormat = ClientFormat,
  Extends extends ExtendsFormat = ExtendsFormat,
> = {
  id?: string;
  extends?: Extends;
  shared?: Shared;
  clientPrefix?: Prefix;
  client?: {
    [Key in keyof Client]: Key extends `${Prefix}${string}`
      ? Client[Key]
      : `${Key extends string ? Key : never} is not prefixed with ${Prefix}.`;
  };
  server?: {
    [Key in keyof Server]: string extends Prefix
      ? Server[Key]
      : Prefix extends undefined | ""
        ? Server[Key]
        : Key extends `${Prefix}${string}`
          ? `${Key extends string ? Key : never} must not use the client prefix ${Prefix}.`
          : Server[Key];
  };
};

type FullSchemaShape<
  Shared extends SharedFormat,
  Server extends ServerFormat,
  Client extends ClientFormat,
  Extends extends ExtendsFormat,
> = Merge<ResolvePresets<Extends>, Merge<Shared, Merge<Server, Client>>>;

export type FinalSchema<
  Shared extends SharedFormat,
  Server extends ServerFormat,
  Client extends ClientFormat,
  Extends extends ExtendsFormat,
> = z.ZodObject<FullSchemaShape<Shared, Server, Client, Extends>>;

export type EnvOptions<
  Prefix extends PrefixFormat = PrefixFormat,
  Shared extends SharedFormat = SharedFormat,
  Server extends ServerFormat = ServerFormat,
  Client extends ClientFormat = ClientFormat,
  Extends extends ExtendsFormat = ExtendsFormat,
  Final extends Schema = Schema,
> = Preset<Prefix, Shared, Server, Client, Extends> & {
  runtimeEnv?: Record<string, string | boolean | number | undefined>;
  skip?: boolean;
  isServer?: boolean;
  onError?: (issues: readonly z.core.$ZodIssue[]) => never;
  onInvalidAccess?: (variable: string) => never;
  transform?: (shape: FullSchemaShape<Shared, Server, Client, Extends>, isServer: boolean) => Final;
};

export type DefineEnv<Final extends Schema = Schema> = Readonly<
  z.output<Final> & { _schema: Final }
>;
