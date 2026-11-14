import { expect, it } from "vitest";
import { getApiEnvironment } from "../env.js";
import inputs from "../env.contract.js";
import { configuredComputerProvider, knownComputerSecrets } from "./computers.js";
it("starts without a computer and never accepts a Docker socket in backend configuration", async () => {
  const environment = getApiEnvironment({
    NODE_ENV: "test",
    DOCKER_HOST: "unix:///private/forbidden-engine.sock",
    SANDBOX_ENGINE_SOCKET: "/private/forbidden-engine.sock",
  });
  expect(await configuredComputerProvider(environment)).toBeNull();
  expect(JSON.stringify(environment)).not.toContain("forbidden-engine.sock");
  expect(() =>
    getApiEnvironment({ SANDBOX_SUPERVISOR_URL: "unix:///private/forbidden-engine.sock" }),
  ).toThrow("SANDBOX_SUPERVISOR_URL");
  expect(Object.keys(inputs).some((key) => /SOCKET|DOCKER_HOST|ENGINE/.test(key))).toBe(false);
});
it("validates the configured HTTP provider and demands an independent token", async () => {
  expect(() => getApiEnvironment({ COMPUTER_PROVIDER: "docker" })).toThrow(
    "SANDBOX_SUPERVISOR_URL",
  );
  const configuration = {
    COMPUTER_PROVIDER: "docker",
    SANDBOX_SUPERVISOR_URL: "http://supervisor.internal:4020",
    SANDBOX_SUPERVISOR_TOKEN: "dedicated-computer-token-with-32-characters",
  };
  expect(() =>
    getApiEnvironment({ ...configuration, APP_KEY: configuration.SANDBOX_SUPERVISOR_TOKEN }),
  ).toThrow("dedicated");
  expect(() =>
    getApiEnvironment({ ...configuration, AUTH_SECRET: configuration.SANDBOX_SUPERVISOR_TOKEN }),
  ).toThrow("dedicated");
  expect(() =>
    getApiEnvironment({
      ...configuration,
      AGENT_MODEL_CREDENTIALS: JSON.stringify({
        primary: { apiKey: configuration.SANDBOX_SUPERVISOR_TOKEN },
      }),
    }),
  ).toThrow("dedicated");
  expect(await configuredComputerProvider(getApiEnvironment(configuration))).not.toBeNull();
});
it("protects configured credential values at the tool boundary", () => {
  const environment = getApiEnvironment({
    AGENT_MODEL_CREDENTIALS: JSON.stringify({ primary: "private-model-credential" }),
    GOOGLE_CLIENT_ID: "fixture-client-id",
    GOOGLE_CLIENT_SECRET: "private-oauth-credential",
  });
  expect(knownComputerSecrets(environment)).toEqual(
    expect.arrayContaining([
      "private-model-credential",
      "private-oauth-credential",
      environment.APP_KEY,
    ]),
  );
  expect(() =>
    knownComputerSecrets(getApiEnvironment({ AGENT_MODEL_CREDENTIALS: '{"primary":3}' })),
  ).toThrow("Invalid deployment model configuration");
});
it("defaults to Ask and accepts an explicit Auto deployment default", () => {
  expect(getApiEnvironment({}).APPROVAL_DEFAULT_MODE).toBe("ask");
  expect(getApiEnvironment({ APPROVAL_DEFAULT_MODE: "never" }).APPROVAL_DEFAULT_MODE).toBe("never");
  expect(getApiEnvironment({ APPROVAL_DEFAULT_MODE: "auto" }).APPROVAL_DEFAULT_MODE).toBe("auto");
  expect(() => getApiEnvironment({ APPROVAL_REQUEST_TTL_MS: "0" })).toThrow("Invalid environment");
});
