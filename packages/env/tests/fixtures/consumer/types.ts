import { createEnv, type InferEnv, z } from "@raypx/env";
import { runtimeEnv } from "@raypx/env/runtime";

const options = {
  extends: [runtimeEnv],
  server: { PORT: z.coerce.number().default(3000) },
  client: { VITE_TITLE: z.string() },
} as const;
const env = createEnv(options);
const port: number = env.PORT;
const title: string = env.VITE_TITLE;
const mode: "development" | "production" | "test" = env.NODE_ENV;
const inferred: InferEnv<typeof options> = env;
// @ts-expect-error The schema's numeric output cannot be treated as a string.
const invalid: string = env.PORT;
export { port, title, mode, inferred, invalid };
