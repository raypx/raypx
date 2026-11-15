import { expect, it } from "vitest";
import { getApiEnvironment } from "../env.js";
import inputs from "../env.contract.js";
import { knownComputerSecrets } from "./computers.js";
it("ignores provider environment at runtime and never accepts a backend Engine socket", () => {
  const environment = getApiEnvironment({
    NODE_ENV: "test",
    COMPUTER_PROVIDER: "docker",
    SANDBOX_SUPERVISOR_URL: "unix:///fake.sock",
    SANDBOX_ENGINE_SOCKET: "/fake.sock",
  });
  expect(JSON.stringify(environment)).not.toContain("fake.sock");
  expect(
    Object.keys(inputs).some((key) =>
      /SOCKET|DOCKER_HOST|ENGINE|SUPERVISOR|COMPUTER_PROVIDER/.test(key),
    ),
  ).toBe(false);
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
