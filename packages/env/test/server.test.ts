import { afterEach, expect, test, vi } from "vite-plus/test";
import { parseServerEnv, ServerEnvironmentError } from "../src/server.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("uses defaults and omits unspecified optional configuration", () => {
  expect(parseServerEnv({})).toEqual({
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: 3000,
    API_BODY_MAX_BYTES: 1_048_576,
    API_BODY_TIMEOUT_MS: 10_000,
  });
});

test("treats blank strings as unset instead of coercing PORT to zero", () => {
  expect(
    parseServerEnv({ NODE_ENV: " ", HOST: "", PORT: "\t", LOG_LEVEL: " ", APP_VERSION: "" }),
  ).toEqual({
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: 3000,
    API_BODY_MAX_BYTES: 1_048_576,
    API_BODY_TIMEOUT_MS: 10_000,
  });
});

test("parses and freezes supplied configuration while stripping unknown fields", () => {
  const env = parseServerEnv({
    NODE_ENV: " production ",
    HOST: "0.0.0.0",
    PORT: "8080",
    LOG_LEVEL: "warn",
    APP_VERSION: "release-123",
    API_BODY_MAX_BYTES: 1_048_576,
    API_BODY_TIMEOUT_MS: 10_000,
    SESSION_SECRET: "private-test-value",
  });
  expect(env).toEqual({
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PORT: 8080,
    LOG_LEVEL: "warn",
    APP_VERSION: "release-123",
    API_BODY_MAX_BYTES: 1_048_576,
    API_BODY_TIMEOUT_MS: 10_000,
  });
  expect(Object.isFrozen(env)).toBe(true);
});

test.each(["localhost", "0.0.0.0", "127.0.0.1", "::", "::1", "web.internal", "web.internal."])(
  "accepts listening host %s",
  (HOST) => {
    expect(parseServerEnv({ HOST }).HOST).toBe(HOST);
  },
);

test.each(["http://localhost", "localhost:3000", "999.0.0.1", "bad host", "-host", "host_1", "*"])(
  "rejects invalid listening host %s",
  (HOST) => {
    expect(() => parseServerEnv({ HOST })).toThrow("HOST");
  },
);

test.each(["staging", "prod", false, 0])("rejects invalid NODE_ENV %s", (NODE_ENV) => {
  expect(() => parseServerEnv({ NODE_ENV })).toThrow("NODE_ENV");
});

test.each(["1", "65535", 3000])("accepts integer PORT %s", (PORT) => {
  expect(parseServerEnv({ PORT }).PORT).toBe(Number(PORT));
});

test.each(["0", "65536", "-1", "3000.5", "3e3", "0xBB8", "abc", false, null, 12.5])(
  "rejects invalid PORT %s",
  (PORT) => {
    expect(() => parseServerEnv({ PORT })).toThrow("PORT");
  },
);

test.each(["trace", "debug", "info", "warn", "error", "fatal", "silent"])(
  "supports LOG_LEVEL %s",
  (LOG_LEVEL) => {
    expect(parseServerEnv({ LOG_LEVEL }).LOG_LEVEL).toBe(LOG_LEVEL);
  },
);

test("rejects invalid optional configuration", () => {
  expect(() => parseServerEnv({ LOG_LEVEL: "verbose" })).toThrow("LOG_LEVEL");
  expect(() => parseServerEnv({ APP_VERSION: 123 })).toThrow("APP_VERSION");
  expect(() => parseServerEnv({ APP_VERSION: "x".repeat(129) })).toThrow("APP_VERSION");
});

test("uses Nitro overrides for the effective listener configuration", () => {
  expect(
    parseServerEnv({ HOST: "127.0.0.1", PORT: "3000", NITRO_HOST: "::1", NITRO_PORT: "9000" }),
  ).toEqual({
    NODE_ENV: "development",
    HOST: "::1",
    PORT: 9000,
    API_BODY_MAX_BYTES: 1_048_576,
    API_BODY_TIMEOUT_MS: 10_000,
  });
});

test("validates the effective values when Nitro overrides lower-priority values", () => {
  expect(
    parseServerEnv({
      HOST: "unused://host",
      PORT: "unused-port",
      NITRO_HOST: "localhost",
      NITRO_PORT: "9000",
    }),
  ).toEqual({
    NODE_ENV: "development",
    HOST: "localhost",
    PORT: 9000,
    API_BODY_MAX_BYTES: 1_048_576,
    API_BODY_TIMEOUT_MS: 10_000,
  });
});

test("falls back to HOST and PORT for blank Nitro overrides", () => {
  expect(
    parseServerEnv({ HOST: "localhost", PORT: "8080", NITRO_HOST: " ", NITRO_PORT: "" }),
  ).toEqual({
    NODE_ENV: "development",
    HOST: "localhost",
    PORT: 8080,
    API_BODY_MAX_BYTES: 1_048_576,
    API_BODY_TIMEOUT_MS: 10_000,
  });
  expect(parseServerEnv({ NITRO_HOST: "", NITRO_PORT: "\t" }).PORT).toBe(3000);
});

test.each(["abc", "0", "65536", "3000.5"])(
  "rejects invalid NITRO_PORT %s even when PORT is valid",
  (NITRO_PORT) => {
    expect(() => parseServerEnv({ PORT: "3000", NITRO_PORT })).toThrow("NITRO_PORT");
  },
);

test("reports the actual invalid Nitro override fields without values", () => {
  const secret = "credential-sentinel://override";
  const error = (() => {
    try {
      parseServerEnv({ NITRO_HOST: secret, NITRO_PORT: secret });
    } catch (caught) {
      return caught;
    }
    return undefined;
  })();
  expect(error).toBeInstanceOf(ServerEnvironmentError);
  if (!(error instanceof ServerEnvironmentError)) throw new Error("Expected validation to fail");
  expect(error.issues.map(({ field }) => field)).toEqual(["NITRO_HOST", "NITRO_PORT"]);
  expect(error.message).not.toContain(secret);
  expect(JSON.stringify(error)).not.toContain(secret);
});

test("aggregates invalid fields without retaining supplied credentials in errors", () => {
  const secret = "credential-sentinel://for-redaction";
  const error = (() => {
    try {
      parseServerEnv({
        NODE_ENV: "production",
        HOST: secret,
        PORT: secret,
        SESSION_SECRET: secret,
      });
    } catch (caught) {
      return caught;
    }
    return undefined;
  })();
  expect(error).toBeInstanceOf(ServerEnvironmentError);
  if (!(error instanceof ServerEnvironmentError)) throw new Error("Expected validation to fail");
  expect(error.issues.map(({ field }) => field)).toEqual(["HOST", "PORT"]);
  expect(error.message).not.toContain(secret);
  expect(error.stack).not.toContain(secret);
  expect(JSON.stringify(error)).not.toContain(secret);
  expect(Object.isFrozen(error.issues)).toBe(true);
});

test("does not validate on import, but validates on the first getter call", async () => {
  vi.stubEnv("PORT", "invalid-port");
  const module = await import("../src/server.js");
  expect(() => module.getServerEnv()).toThrow("PORT");
});

test("loads explicit configuration and reuses it until the next explicit load", async () => {
  const { loadServerEnv, getServerEnv } = await import("../src/server.js");
  const initial = loadServerEnv({ NODE_ENV: "test", PORT: "9000" });
  vi.stubEnv("PORT", "invalid-port");
  expect(getServerEnv()).toBe(initial);
  expect(getServerEnv().PORT).toBe(9000);
  const reloaded = loadServerEnv({ NODE_ENV: "production", PORT: "9001" });
  expect(getServerEnv()).toBe(reloaded);
  expect(getServerEnv().PORT).toBe(9001);
  expect(() => loadServerEnv({ PORT: "invalid" })).toThrow("PORT");
  expect(getServerEnv()).toBe(reloaded);
});
