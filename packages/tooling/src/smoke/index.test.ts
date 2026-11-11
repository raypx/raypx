import { rejects } from "node:assert/strict";
import { stubEnv, stubGlobal } from "../../tests/helpers/stubs.ts";
import { beforeEach, expect, it, mock } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workspaceFixtures } from "../../tests/helpers/workspace.ts";

const run = mock(async (..._args: unknown[]) => {});
const networkInterfaces = mock((): Record<string, unknown[]> => ({ lo: [], eth0: [] }));
await mock.module("@raypx/runtime-node/process", () => ({ run }));
const os = await import("node:os");
await mock.module("node:os", () => ({ ...os, networkInterfaces }));
await mock.module("./artifacts", () => ({ probeApi: mock(), probeWeb: mock() }));
const { smoke } = await import("./index.ts");
const { fixture } = workspaceFixtures();

beforeEach(() => {
  run.mockReset();
  networkInterfaces.mockReturnValue({ lo: [], eth0: [] });
  stubGlobal("process", { ...process, platform: "linux" });
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
  stubEnv("RAYPX_CLI_PAYLOAD", payload);
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
  stubGlobal("process", { ...process, platform });
  await smoke(root, ["cli"]);
  expect(run).toHaveBeenCalledWith(process.execPath, ["run", "smoke"], join(root, "apps/cli"));
  expect(run.mock.calls.some(([command]) => command === "docker")).toBe(false);
});

it("fails Linux acceptance without falling back to the host when Docker fails", async () => {
  const root = repository();
  run.mockImplementation(async (command) => {
    if (command === "docker") throw new Error("Docker unavailable");
  });
  await rejects(smoke(root, ["cli"]), (error: unknown) => {
    expect(error).toMatchObject({
      errors: [expect.objectContaining({ message: "Docker unavailable" })],
    });
    return true;
  });
  expect(
    run.mock.calls.some(
      ([command, args]) =>
        command === process.execPath && JSON.stringify(args) === '["run","smoke"]',
    ),
  ).toBe(false);
});
