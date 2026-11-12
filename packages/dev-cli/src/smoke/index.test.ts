import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workspaceFixtures } from "../../tests/helpers/workspace.js";

const { run, networkInterfaces } = vi.hoisted(() => ({
  run: vi.fn(async (..._args: unknown[]) => {}),
  networkInterfaces: vi.fn((): Record<string, unknown[]> => ({ lo: [], eth0: [] })),
}));
vi.mock("@raypx/runtime-node/process", () => ({ run }));
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  networkInterfaces,
}));
vi.mock("./artifacts.js", () => ({ probeApi: vi.fn(), probeWeb: vi.fn() }));
const { smoke } = await import("./index.js");
const { fixture } = workspaceFixtures();

beforeEach(() => {
  run.mockReset();
  networkInterfaces.mockReturnValue({ lo: [], eth0: [] });
  vi.stubGlobal("process", { ...process, platform: "linux" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function repository() {
  const root = fixture();
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ ...manifest, packageManager: "bun@1.4.4" }),
  );
  mkdirSync(join(root, "apps/cli"), { recursive: true });
  return root;
}

it("runs Linux CLI acceptance with loopback-only Docker networking and the prepared payload", async () => {
  const root = repository();
  const payload = join(root, "prepared payload");
  vi.stubEnv("RAYPX_CLI_PAYLOAD", payload);
  await smoke(root, ["cli"]);
  expect(run).toHaveBeenCalledWith(
    "docker",
    expect.arrayContaining([
      "run",
      "--rm",
      "--network",
      "none",
      `type=bind,src=${root},dst=/repo,readonly`,
      `type=bind,src=${payload},dst=/payload,readonly`,
      `type=bind,src=${join(root, ".artifacts/cli")},dst=/repo/.artifacts/cli`,
      "RAYPX_CLI_PAYLOAD=/payload",
      "oven/bun:1.4.4",
      "--no-env-file",
    ]),
    root,
  );
  expect(
    run.mock.calls.some(
      ([command, args]) =>
        command === process.execPath && JSON.stringify(args) === '["run","smoke"]',
    ),
  ).toBe(false);
});

it("keeps an already isolated Linux namespace independent of Docker", async () => {
  const root = repository();
  networkInterfaces.mockReturnValue({ lo: [] });
  await smoke(root, ["cli"]);
  expect(run).toHaveBeenCalledWith(process.execPath, ["run", "smoke"], join(root, "apps/cli"));
  expect(run.mock.calls.some(([command]) => command === "docker")).toBe(false);
});

it.each(["darwin", "win32"])("retains native CLI acceptance on %s", async (platform) => {
  const root = repository();
  vi.stubGlobal("process", { ...process, platform });
  await smoke(root, ["cli"]);
  expect(run).toHaveBeenCalledWith(process.execPath, ["run", "smoke"], join(root, "apps/cli"));
  expect(run.mock.calls.some(([command]) => command === "docker")).toBe(false);
});

it("fails Linux acceptance without falling back to the host when Docker fails", async () => {
  const root = repository();
  run.mockImplementation(async (command) => {
    if (command === "docker") throw new Error("Docker unavailable");
  });
  await expect(smoke(root, ["cli"])).rejects.toMatchObject({
    errors: [expect.objectContaining({ message: "Docker unavailable" })],
  });
  expect(
    run.mock.calls.some(
      ([command, args]) =>
        command === process.execPath && JSON.stringify(args) === '["run","smoke"]',
    ),
  ).toBe(false);
});
