import assert from "node:assert/strict";
import { cp, mkdtemp, rm, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { verifyCliPayload } from "@raypx/tooling/build/cli";
import manifest from "../../package.json";
const prepared = resolve(
  process.env.RAYPX_CLI_PAYLOAD ?? resolve(import.meta.dirname, "../../dist"),
);
const inventory = await verifyCliPayload(prepared);
const directory = await mkdtemp(join(tmpdir(), "raypx-cli-安装-smoke-"));
const distribution = join(directory, "distribution");
const privateHome = join(directory, "home");
const data = join(directory, "data");
let daemon = false;
try {
  await cp(prepared, distribution, { recursive: true });
  await mkdir(privateHome, { recursive: true });
  const binary = join(distribution, process.platform === "win32" ? "raypx.exe" : "raypx");
  const env = { ...process.env, RAYPX_HOME: privateHome, PATH: "" };
  async function invoke(args: string[], input?: unknown, success = true) {
    const child = Bun.spawn([binary, ...args, "--data-dir", data], {
      cwd: directory,
      env,
      stdin: input === undefined ? "ignore" : new Blob([JSON.stringify(input)]),
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
    });
    const [output, diagnostics, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    assert.equal(exit, success ? 0 : 1, `CLI smoke command ${args[0]} failed`);
    const records = diagnostics
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(records.filter((r) => r.operation === "cli.completed").length, 1);
    return output;
  }
  assert.equal((await invoke(["--version"])).trim(), manifest.version);
  assert.equal(inventory.bunVersion, Bun.version);
  assert.equal(JSON.parse(await invoke(["device", "status", "--json"])).paired, false);
  await invoke(["tasks", "list", "--json"], undefined, false);
  await invoke(["daemon", "start", "--json"]);
  daemon = true;
  const result = JSON.parse(
    await invoke(["daemon", "desktop", "--json"], {
      action: "bootstrap",
      protocol: 1,
      ownerId: "a".repeat(64),
      apiUrl: "https://api.example.test",
      pageOrigin: `mygo://${"b".repeat(32)}`,
      key: Buffer.alloc(32, 4).toString("base64"),
    }),
  );
  assert.equal(result.protocolVersion, 1);
  assert.equal(result.version, manifest.version);
  assert.equal(typeof result.channel.capability, "string");
  assert.notEqual(result.channel.capability, result.nativeCapability);
  assert.equal(Object.hasOwn(result, "token"), false);
  await invoke(["daemon", "stop", "--json"]);
  daemon = false;
  await invoke(["device", "pair", "--yes", "--json"], undefined, false);
  console.log(
    "CLI artifact: 8 checks passed; private Desktop session bootstrap and connector admission verified",
  );
} finally {
  if (daemon) {
    const child = Bun.spawn(
      [
        join(distribution, process.platform === "win32" ? "raypx.exe" : "raypx"),
        "daemon",
        "stop",
        "--data-dir",
        data,
        "--json",
      ],
      {
        env: { ...process.env, RAYPX_HOME: privateHome },
        stdout: "ignore",
        stderr: "ignore",
        windowsHide: true,
      },
    );
    await child.exited;
  }
  await rm(directory, { recursive: true, force: true });
}
