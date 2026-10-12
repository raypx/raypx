import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import { createEnv, defineEnv, EnvError, z, type Preset } from "./index.js";
import { runtimeEnv } from "./runtime.js";

describe("env", () => {
  it("normalizes blank values without mutating the input", () => {
    const runtimeEnv = { OPTIONAL_VALUE: "  " };
    const env = defineEnv({
      server: { OPTIONAL_VALUE: z.string().optional() },
      runtimeEnv,
    });

    expect(env.OPTIONAL_VALUE).toBeUndefined();
    expect(runtimeEnv.OPTIONAL_VALUE).toBe("  ");
  });

  it("composes nested presets without a fixed type-depth limit", () => {
    const one = { shared: { ONE: z.literal("1") } } as const satisfies Preset;
    const two = { extends: [one], shared: { TWO: z.literal("2") } } as const satisfies Preset;
    const three = { extends: [two], shared: { THREE: z.literal("3") } } as const satisfies Preset;
    const four = { extends: [three], shared: { FOUR: z.literal("4") } } as const satisfies Preset;
    const env = createEnv({
      isServer: true,
      extends: [runtimeEnv, four],
      runtimeEnv: { NODE_ENV: "test", ONE: "1", TWO: "2", THREE: "3", FOUR: "4" },
    });

    expect([env.ONE, env.TWO, env.THREE, env.FOUR, env.NODE_ENV]).toEqual([
      "1",
      "2",
      "3",
      "4",
      "test",
    ]);
  });

  it("blocks server values on the client", () => {
    const env = defineEnv({
      isServer: false,
      server: { SECRET_VALUE: z.string() },
      clientPrefix: "VITE_",
      client: { VITE_PUBLIC_VALUE: z.string() },
      runtimeEnv: { SECRET_VALUE: "secret", VITE_PUBLIC_VALUE: "public" },
    });

    expect(env.VITE_PUBLIC_VALUE).toBe("public");
    expect(() => env.SECRET_VALUE).toThrow(/server-side environment variable/);
  });

  it("uses the transformed schema as the exposed final schema", () => {
    const finalSchema = z.object({ PORT: z.coerce.number().int() });
    const env = defineEnv({
      server: { PORT: z.string() },
      runtimeEnv: { PORT: "3002" },
      transform: () => finalSchema,
    });

    expect(env.PORT).toBe(3002);
    expect(env._schema).toBe(finalSchema);
  });

  it("works in a browser-like runtime without a process global", () => {
    const originalProcess = globalThis.process;
    Object.defineProperty(globalThis, "process", { configurable: true, value: undefined });

    try {
      const env = createEnv({
        isServer: false,
        client: { VITE_PUBLIC_VALUE: z.string().default("fallback") },
      });
      expect(env.VITE_PUBLIC_VALUE).toBe("fallback");
    } finally {
      Object.defineProperty(globalThis, "process", {
        configurable: true,
        value: originalProcess,
      });
    }
  });

  it("reports circular preset composition", () => {
    const circular = { id: "circular", extends: [] as Preset[] } satisfies Preset;
    circular.extends.push(circular);

    expect(() => createEnv({ isServer: true, extends: [circular] })).toThrow(EnvError);
  });

  it("applies defaults to blank input and validates the default before transforming", () => {
    const env = defineEnv({
      server: { PORT: z.string().default("3002").transform(Number) },
      runtimeEnv: { PORT: " " },
    });
    expect(env.PORT).toBe(3002);
    expectTypeOf(env.PORT).toEqualTypeOf<number>();

    expect(() =>
      defineEnv({
        server: { PORT: z.number().positive().default(-1) },
        runtimeEnv: {},
      }),
    ).toThrow(EnvError);
  });

  it("keeps later preset overrides and their inferred types", () => {
    const base = { server: { PORT: z.string(), OPTIONAL: z.string().optional() } } as const;
    const override = { extends: [base], server: { PORT: z.coerce.number() } } as const;
    const env = createEnv({
      extends: [base, override],
      runtimeEnv: { PORT: "3002" },
    });
    expect(env.PORT).toBe(3002);
    expect(env.OPTIONAL).toBeUndefined();
    expectTypeOf(env.PORT).toEqualTypeOf<number>();
    expectTypeOf(env.OPTIONAL).toEqualTypeOf<string | undefined>();
  });

  it("reports all invalid keys without including environment values", () => {
    const invalidSecret = "sensitive-invalid-value";
    let failure: unknown;
    try {
      defineEnv({
        server: { PORT: z.coerce.number(), SECRET: z.string().min(50) },
        runtimeEnv: { PORT: "not-a-number", SECRET: invalidSecret },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(EnvError);
    expect((failure as Error).message).toContain("PORT:");
    expect((failure as Error).message).toContain("SECRET:");
    expect((failure as Error).message).not.toContain(invalidSecret);
  });

  it("preserves inherited public values while excluding secrets from browser enumeration", () => {
    const preset = {
      shared: { MODE: z.literal("test") },
      clientPrefix: "VITE_",
      client: { VITE_ORIGIN: z.url() },
      server: { SECRET: z.string() },
    } as const satisfies Preset;
    const env = createEnv({
      extends: [preset],
      isServer: false,
      runtimeEnv: { MODE: "test", VITE_ORIGIN: "https://example.test", SECRET: "private" },
    });
    expect(env.MODE).toBe("test");
    expect(env.VITE_ORIGIN).toBe("https://example.test");
    expect(Object.keys(env)).toEqual(["MODE", "VITE_ORIGIN"]);
    expect(() => env.SECRET).toThrow(EnvError);
  });

  it("enforces public prefixes in types and rejects invalid access at runtime", () => {
    const env = createEnv({
      isServer: false,
      client: {
        // @ts-expect-error Public variables must use the VITE_ prefix.
        SECRET: z.string().default("private"),
      },
      server: {
        // @ts-expect-error Server variables cannot use the public prefix.
        VITE_SECRET: z.string().default("private"),
      },
      runtimeEnv: {},
    });
    expect(() => env.SECRET).toThrow(EnvError);
    expect(() => env.VITE_SECRET).toThrow(EnvError);
  });
});
