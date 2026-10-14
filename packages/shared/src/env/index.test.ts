import {
  createEnv as libraryCreateEnv,
  defineEnv as libraryDefineEnv,
  EnvError as LibraryEnvError,
  z as libraryZ,
} from "@voidmix/env";
import { runtimeEnv as libraryRuntimeEnv } from "@voidmix/env/runtime";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import { loggerEnv } from "../logger/env.js";
import { createEnv, defineEnv, EnvError, z, type Preset } from "./index.js";
import { runtimeEnv } from "./runtime.js";

describe("environment compatibility facade", () => {
  it("shares the library's functions, error class, Zod and runtime preset", () => {
    expect(createEnv).toBe(libraryCreateEnv);
    expect(defineEnv).toBe(libraryDefineEnv);
    expect(EnvError).toBe(LibraryEnvError);
    expect(z).toBe(libraryZ);
    expect(runtimeEnv).toBe(libraryRuntimeEnv);
  });

  it("preserves inferred types when composing runtime and application presets", () => {
    const base = { server: { PORT: z.string() } } as const satisfies Preset;
    const numeric = {
      extends: [base],
      server: { PORT: z.coerce.number().int() },
    } as const satisfies Preset;
    const env = createEnv({
      extends: [runtimeEnv, numeric],
      runtimeEnv: { NODE_ENV: "test", PORT: "3002" },
    });

    expect(env.NODE_ENV).toBe("test");
    expect(env.PORT).toBe(3002);
    expectTypeOf(env.PORT).toEqualTypeOf<number>();
    expectTypeOf(env.NODE_ENV).toEqualTypeOf<"development" | "production" | "test">();
  });

  it("composes logger and application values without exposing server fields to browsers", () => {
    const env = createEnv({
      extends: [runtimeEnv, loggerEnv],
      isServer: false,
      client: { VITE_API_URL: z.url() },
      server: { SECRET: z.string() },
      runtimeEnv: {
        NODE_ENV: "test",
        VITE_API_URL: "https://api.example.test",
        VITE_LOG_LEVEL: "debug",
        VITE_LOG_PRETTY: "false",
        LOG_LEVEL: "error",
        SECRET: "private",
      },
    });

    expect(env.VITE_API_URL).toBe("https://api.example.test");
    expect(env.VITE_LOG_LEVEL).toBe("debug");
    expect(env.VITE_LOG_PRETTY).toBe(false);
    expectTypeOf(env.VITE_API_URL).toEqualTypeOf<string>();
    expectTypeOf(env.VITE_LOG_PRETTY).toEqualTypeOf<boolean | undefined>();
    expect(Object.keys(env)).not.toContain("SECRET");
    expect(Object.keys(env)).not.toContain("LOG_LEVEL");
    expect(() => env.SECRET).toThrow(LibraryEnvError);
    expect(() => Reflect.get(env, "LOG_LEVEL")).toThrow(LibraryEnvError);
    expect(() => Reflect.get(env, "UNDECLARED")).toThrow(LibraryEnvError);
  });
});
