import { describe, expect, expectTypeOf, it } from "vitest";
import { createEnv, defineEnv, EnvError, z, type InferEnv } from "@raypx/env";
import { runtimeEnv } from "./runtime.js";
import externalZod from "zod";

describe("public workspace entries", () => {
  it("shares the consumer's Zod and composes the runtime entry with transformed defaults", () => {
    expect(z).toBe(externalZod);
    const env = createEnv({
      extends: [runtimeEnv],
      server: { PORT: z.coerce.number().default(3000) },
      client: { VITE_TITLE: z.string().default("Kit") },
      isServer: true,
      runtimeEnv: { PORT: "", NODE_ENV: "test" },
    });
    expect([env.PORT, env.VITE_TITLE, env.NODE_ENV]).toEqual([3000, "Kit", "test"]);
    expect(env._schema.shape.PORT).toBeInstanceOf(externalZod.ZodDefault);
  });

  it("exports browser guards and shared values through the consumer entry", () => {
    const browser = defineEnv({
      clientPrefix: "PUBLIC_",
      shared: { MODE: z.string().default("public") },
      client: { PUBLIC_TITLE: z.string().default("Kit") },
      server: { SECRET: z.string() },
      isServer: false,
      runtimeEnv: {},
    });
    expect([browser.MODE, browser.PUBLIC_TITLE]).toEqual(["public", "Kit"]);
    expect(() => browser.SECRET).toThrow(EnvError);
  });

  it("exposes schema output types across both package exports", () => {
    const options = {
      extends: [runtimeEnv],
      server: { PORT: z.coerce.number().default(3000) },
      client: { VITE_TITLE: z.string().default("Kit") },
      runtimeEnv: {},
    } as const;
    const env = createEnv(options);
    expectTypeOf(env.PORT).toEqualTypeOf<number>();
    expectTypeOf(env.PORT).not.toEqualTypeOf<string>();
    expectTypeOf(env.VITE_TITLE).toEqualTypeOf<string>();
    expectTypeOf(env.NODE_ENV).toEqualTypeOf<"development" | "production" | "test">();
    expectTypeOf(env).toMatchTypeOf<InferEnv<typeof options>>();
  });
});
