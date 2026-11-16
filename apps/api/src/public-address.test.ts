import { expect, it } from "vitest";
import { nativeClientOrigins } from "@raypx/core/auth";
import {
  getApiEnvironment,
  getRelayEnvironment,
  getServerRole,
  getWorkerEnvironment,
} from "./env.js";
import { createAuthConfig } from "./runtime/adapters.js";

const production = {
  NODE_ENV: "production",
  PUBLIC_URL: "https://web.example.test",
  DATABASE_URL: "postgres://fixture:fixture@localhost/raypx_test",
  AUTH_SECRET: "synthetic-auth-secret-for-tests-32-chars",
  APP_KEY: "synthetic-app-key-for-tests-only-32-chars",
};

for (const parse of [getApiEnvironment, getRelayEnvironment, getWorkerEnvironment]) {
  it(`${parse.name} derives a shared origin, authentication and native trust from PUBLIC_URL`, () => {
    const environment = parse(production);
    expect(environment.publicWebOrigin).toBe(production.PUBLIC_URL);
    expect(environment.publicApiOrigin).toBe(production.PUBLIC_URL);
    expect(environment.allowedOrigins).toEqual([
      production.PUBLIC_URL,
      ...Object.values(nativeClientOrigins),
    ]);
    expect(environment).not.toHaveProperty("AUTH_URL");
    expect(environment).not.toHaveProperty("ALLOWED_ORIGINS");
    expect(createAuthConfig(getApiEnvironment(production)).baseURL).toBe(production.PUBLIC_URL);
  });

  it(`${parse.name} derives split origins and normalizes/deduplicates exact extras`, () => {
    const environment = parse({
      ...production,
      PUBLIC_URL: "https://WEB.example.test:443",
      API_PUBLIC_URL: "https://api.example.test",
      AUTH_DOMAIN: "example.test",
      AUTH_PASSKEY_RP_ID: "example.test",
      EXTRA_ALLOWED_ORIGINS: ` https://extra.example.test,https://web.example.test,${nativeClientOrigins.desktop},${nativeClientOrigins.mobile},https://extra.example.test:443, `,
    });
    expect(environment.publicWebOrigin).toBe(production.PUBLIC_URL);
    expect(environment.publicApiOrigin).toBe("https://api.example.test");
    expect(environment.allowedOrigins).toEqual([
      production.PUBLIC_URL,
      "https://api.example.test",
      ...Object.values(nativeClientOrigins),
      "https://extra.example.test",
    ]);
  });

  it(`${parse.name} keeps the existing local Web/API development ports without setup`, () => {
    const environment = parse({ DATABASE_URL: production.DATABASE_URL });
    expect(environment.publicWebOrigin).toBe("http://localhost:3000");
    expect(environment.publicApiOrigin).toBe("http://localhost:3002");
    expect(environment.allowedOrigins).toEqual([
      "http://localhost:3000",
      "http://localhost:3002",
      ...Object.values(nativeClientOrigins),
    ]);
  });

  it.each(["PUBLIC_URL", "API_PUBLIC_URL"])(
    `${parse.name} rejects non-origin or insecure production %s`,
    (key) => {
      for (const value of [
        "https://web.example.test/",
        "https://web.example.test/path",
        "https://web.example.test/..",
        "https://web.example.test?",
        "https://web.example.test#",
        "https://user:password@web.example.test",
        "https://*.example.test",
        "https://%2a.example.test",
        "https://@web.example.test",
        "http://localhost:3000",
        "invalid",
        "https://web.example.test\\path",
      ])
        expect(() => parse({ ...production, [key]: value })).toThrow(key);
    },
  );

  it(`${parse.name} requires PUBLIC_URL in production`, () => {
    expect(() => parse({ ...production, PUBLIC_URL: undefined })).toThrow("PUBLIC_URL");
  });

  it.each([
    "*",
    "https://*.example.test",
    "https://extra.example.test/",
    "https://extra.example.test/path",
    "https://user:pass@extra.example.test",
    "null",
    "file:///tmp/page",
  ])(`${parse.name} rejects invalid extra %s`, (value) => {
    expect(() => parse({ ...production, EXTRA_ALLOWED_ORIGINS: value })).toThrow(
      "EXTRA_ALLOWED_ORIGINS",
    );
  });
}

for (const parse of [getApiEnvironment, getRelayEnvironment, getWorkerEnvironment, getServerRole]) {
  it.each([
    ["AUTH_URL", "PUBLIC_URL"],
    ["ALLOWED_ORIGINS", "EXTRA_ALLOWED_ORIGINS"],
    ["DEVICE_CONNECTOR_ORIGIN", "API_PUBLIC_URL"],
  ])(`${parse.name} refuses retired %s even when empty`, (key, replacement) => {
    for (const value of ["", "https://old.example.test"]) {
      expect(() => parse({ ...production, [key]: value })).toThrow(key);
      expect(() => parse({ ...production, [key]: value })).toThrow(replacement);
    }
  });
}

it("sets authentication and its passkey RP source to the API origin in split deployments", () => {
  const environment = getApiEnvironment({
    ...production,
    API_PUBLIC_URL: "https://api.example.test",
    AUTH_DOMAIN: "example.test",
    AUTH_PASSKEY_RP_ID: "example.test",
  });
  expect(createAuthConfig(environment)).toMatchObject({
    baseURL: "https://api.example.test",
    trustedOrigins: [
      production.PUBLIC_URL,
      "https://api.example.test",
      ...Object.values(nativeClientOrigins),
    ],
  });
});

it.each(["other.example.test", "test", "com", "co.uk", "example.test.other"])(
  "rejects an unrelated or non-registrable passkey RP ID",
  (rp) => {
    expect(() => getApiEnvironment({ ...production, AUTH_PASSKEY_RP_ID: rp })).toThrow(
      "AUTH_PASSKEY_RP_ID",
    );
  },
);
it("accepts an explicit parent RP ID and cookie domain for split hosts", () => {
  expect(
    getApiEnvironment({
      ...production,
      API_PUBLIC_URL: "https://api.example.test",
      AUTH_PASSKEY_RP_ID: "example.test",
      AUTH_DOMAIN: ".example.test",
    }).publicApiOrigin,
  ).toBe("https://api.example.test");
});
it("requires split Web/API sessions to cover both hosts", () => {
  const split = {
    ...production,
    API_PUBLIC_URL: "https://api.example.test",
    AUTH_PASSKEY_RP_ID: "example.test",
  };
  for (const domain of [
    undefined,
    "api.example.test",
    "test",
    "other.test",
    "https://example.test",
  ])
    expect(() => getApiEnvironment({ ...split, AUTH_DOMAIN: domain })).toThrow("AUTH_DOMAIN");
});
it("requires a Web public address when declaring a production split API address", () => {
  expect(() =>
    getApiEnvironment({
      ...production,
      PUBLIC_URL: undefined,
      API_PUBLIC_URL: "https://api.example.test",
    }),
  ).toThrow("PUBLIC_URL");
});
it.each(["https://0.0.0.0", "https://[::]", "https://255.255.255.255"])(
  "rejects connector public endpoints that cannot identify a destination host",
  (origin) => {
    expect(() => getApiEnvironment({ ...production, API_PUBLIC_URL: origin })).toThrow(
      /API_PUBLIC_URL.*device connectors/,
    );
  },
);
it("rejects a mixed scheme and a public suffix even when it matches both hosts", () => {
  expect(() =>
    getApiEnvironment({
      PUBLIC_URL: "http://web.example.test",
      API_PUBLIC_URL: "https://api.example.test",
      AUTH_DOMAIN: "example.test",
      AUTH_PASSKEY_RP_ID: "example.test",
    }),
  ).toThrow("same scheme");
  expect(() =>
    getApiEnvironment({
      ...production,
      PUBLIC_URL: "https://web.example.co.uk",
      AUTH_PASSKEY_RP_ID: "co.uk",
    }),
  ).toThrow("AUTH_PASSKEY_RP_ID");
  expect(() =>
    getApiEnvironment({
      ...production,
      PUBLIC_URL: "https://web.example.co.uk",
      AUTH_DOMAIN: "co.uk",
    }),
  ).toThrow("AUTH_DOMAIN");
});
