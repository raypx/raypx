import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const probeArtifact = vi.hoisted(() => vi.fn(async (_options: unknown) => {}));
vi.mock("../repo/artifact.js", () => ({ probeArtifact }));
const { probeApi, probeWeb } = await import("./artifacts.js");
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  probeArtifact.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

it.each([
  ["api", probeApi],
  ["web", probeWeb],
] as const)(
  "starts the relocated %s output with the running Bun executable",
  async (app, probe) => {
    await probe("/repo");
    expect(probeArtifact).toHaveBeenCalledTimes(app === "api" ? 3 : 1);
    const options = probeArtifact.mock.calls[0]![0] as Record<string, unknown>;
    // No NODE_BINARY or pinned Node lookup: the probe runs the output under this Bun.
    expect(options).toMatchObject({
      name: app,
      output: join("/repo", "apps", app, ".output"),
      node: process.execPath,
    });
    expect(process.versions.bun).toBeTruthy();
  },
);

it("probes the API without a database or mail provider", async () => {
  await probeApi("/repo");
  const { environment } = probeArtifact.mock.calls[0]![0] as {
    environment: (base: string) => Record<string, string>;
  };
  expect(environment("http://127.0.0.1:1234")).toMatchObject({
    NODE_ENV: "test",
    DATABASE_MIGRATE_ON_START: "false",
    AUTH_URL: "http://127.0.0.1:1234",
    ALLOWED_ORIGINS: "http://127.0.0.1:1234",
  });
});

it("runs all backend roles from the same prepared output with no auth input on relay", async () => {
  await probeApi("/repo");
  const options = probeArtifact.mock.calls.map(
    ([value]) =>
      value as {
        output: string;
        environment(base: string): Record<string, string>;
      },
  );
  expect(options.map((value) => value.output)).toEqual(Array(3).fill("/repo/apps/api/.output"));
  const environments = options.map((value) => value.environment("http://127.0.0.1:1234"));
  expect(environments.map((value) => value.SERVER_ROLE)).toEqual(["api", "both", "relay"]);
  expect(environments[1]).not.toHaveProperty("REDIS_URL");
  expect(environments[2]).not.toHaveProperty("AUTH_SECRET");
});
