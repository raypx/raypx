import { expect, it } from "vitest";
import { getApiEnvironment } from "../env.js";
import inputs from "../env.contract.js";
import { configuredComputerProvider } from "./computers.js";
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
