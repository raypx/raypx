import assert from "node:assert/strict";
import { createEnv, defineEnv, EnvError, z } from "@raypx/env";
import { runtimeEnv } from "@raypx/env/runtime";
import externalZod from "zod";

assert.equal(z, externalZod);
const env = createEnv({
  extends: [runtimeEnv],
  server: { PORT: z.coerce.number().default(3000) },
  client: { VITE_TITLE: z.string().default("Kit") },
  isServer: true,
  runtimeEnv: { PORT: "", NODE_ENV: "test" },
});
assert.equal(env.PORT, 3000);
assert.equal(env.VITE_TITLE, "Kit");
assert.equal(env.NODE_ENV, "test");
assert.equal(env._schema.shape.PORT instanceof externalZod.ZodDefault, true);

const browser = defineEnv({
  clientPrefix: "PUBLIC_",
  shared: { MODE: z.string().default("public") },
  client: { PUBLIC_TITLE: z.string().default("Kit") },
  server: { SECRET: z.string() },
  isServer: false,
  runtimeEnv: {},
});
assert.equal(browser.MODE, "public");
assert.equal(browser.PUBLIC_TITLE, "Kit");
assert.throws(() => browser.SECRET, EnvError);
