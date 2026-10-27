import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vite-plus/test";

const probeArtifact = vi.hoisted(() => vi.fn(async (_options: unknown) => {}));
vi.mock("@raypx-kit/devkit/artifact", () => ({ probeArtifact }));
const { probeApi, probeWeb } = await import("../../src/smoke/artifacts.js");
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
    expect(probeArtifact).toHaveBeenCalledOnce();
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
    AUTH_URL: "http://127.0.0.1:1234",
    ALLOWED_ORIGINS: "http://127.0.0.1:1234",
    RESEND_API_KEY: "",
    MAIL_FROM: "",
  });
});
