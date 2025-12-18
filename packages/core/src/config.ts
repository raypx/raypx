export type PluginContext = {
  env: Record<string, string>;
};

export type Plugin = {
  name: string;
  setup: (ctx: PluginContext) => void;
};

export type Config<Env> = {
  envs?: Env;
  plugins?: Plugin[];
};

export function defineConfig<Env>(config: Config<Env>) {
  return config;
}
