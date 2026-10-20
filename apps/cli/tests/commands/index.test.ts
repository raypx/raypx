import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vite-plus/test";
import { access, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FileEntry, JobDefinition, RootGrant, ToolResult } from "@raypx/contracts/local";
import manifest from "../../package.json";
import { parseCliArgs } from "../../src/commands/args";
import { runCommand } from "../../src/commands/index";

let directory: string;
let dataDir: string;
let authorized: string;
let output: MockInstance<typeof console.log>;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "raypx-command-test-"));
  dataDir = join(directory, "state");
  authorized = join(directory, "工作 目录 --help");
  await mkdir(authorized);
  output = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  output.mockRestore();
  await rm(directory, { recursive: true, force: true });
});

async function invoke<T>(args: string[], options: { dataDir?: string; profile?: string } = {}) {
  output.mockClear();
  await runCommand(parseCliArgs(args), { dataDir, ...options });
  expect(output).toHaveBeenCalledTimes(1);
  return JSON.parse(String(output.mock.calls[0]?.[0])) as T;
}

async function authorize() {
  return invoke<RootGrant>(["files", "authorize", authorized, "--json"]);
}

describe("CLI command adapter", () => {
  it("authorizes directories and lists the same persisted grants using existing file commands", async () => {
    const grant = await authorize();
    expect(grant).toMatchObject({ path: await realpath(authorized), name: "工作 目录 --help" });
    expect(grant.id).toEqual(expect.any(String));
    expect(await invoke<RootGrant[]>(["files", "roots", "--json"])).toEqual([grant]);
  });

  it("keeps the direct roots commands and revocation removes only the grant", async () => {
    const grant = await invoke<RootGrant>([
      "roots",
      "register",
      JSON.stringify({ path: authorized }),
      "--json",
    ]);
    expect(await invoke<RootGrant[]>(["roots", "list", "--json"])).toEqual([grant]);
    expect(await invoke(["roots", "remove", JSON.stringify({ id: grant.id }), "--json"])).toEqual({
      removed: true,
    });
    expect(await invoke(["files", "roots", "--json"])).toEqual([]);
    await access(authorized);
  });

  it("lets explicit profile and data-directory arguments override caller defaults", async () => {
    const selectedDataDir = join(directory, "selected state");
    const args = ["--data-dir", selectedDataDir, "--profile", "selected"];
    const grant = await invoke<RootGrant>([...args, "files", "authorize", authorized, "--json"], {
      profile: "fallback",
    });
    expect(
      await invoke<RootGrant[]>(["files", "roots", "--json", ...args], { profile: "fallback" }),
    ).toEqual([grant]);
    await expect(access(join(dataDir, "profiles", "fallback"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await invoke(["files", "roots", "--json"], { profile: "fallback" })).toEqual([]);
  });

  it("keeps flag-looking text inside job JSON unchanged", async () => {
    const grant = await authorize();
    const name = "任务　--help --version --json --yes";
    const job = await invoke<JobDefinition>([
      "jobs",
      "create",
      JSON.stringify({
        name,
        cron: "0 * * * *",
        timezone: "UTC",
        enabled: false,
        action: { type: "directory.scan", rootId: grant.id, path: "" },
      }),
      "--json",
    ]);
    expect(job.name).toBe(name);
    expect(await invoke<JobDefinition[]>(["jobs", "list", "--json"])).toEqual([job]);
  });

  it("passes embedded tool argument flags to the real executable", async () => {
    const flags = ["--help", "--version", "--json", "--yes", "--profile=private", "工作 目录"];
    const result = await invoke<ToolResult>([
      "tools",
      "run",
      JSON.stringify({
        executable: process.execPath,
        args: ["-e", "console.log(JSON.stringify(process.argv))", "--", ...flags],
        cwd: directory,
        timeoutMs: 5000,
      }),
      "--json",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.cancelled).toBe(false);
    expect(JSON.parse(result.output)).toEqual(expect.arrayContaining(flags));
  });

  it("accepts directory and JSON operands after the option delimiter without rewriting them", async () => {
    const grant = await invoke<RootGrant>(["files", "authorize", "--json", "--", authorized]);
    const text = "原样 --help --json --yes\n第二行";
    const path = "参数 --version.txt";
    await invoke([
      "files",
      "write",
      "--json",
      "--",
      JSON.stringify({ rootId: grant.id, path, text, version: null }),
    ]);
    expect(await readFile(join(authorized, path), "utf8")).toBe(text);
    expect(
      await invoke(["files", "read", "--json", "--", JSON.stringify({ rootId: grant.id, path })]),
    ).toMatchObject({ text, version: expect.any(String) });
  });

  it("does not allow a JSON payload to bypass explicit deletion confirmation", async () => {
    const grant = await authorize();
    const path = "delete.txt";
    await writeFile(join(authorized, path), "keep until confirmed");
    const file = await invoke<FileEntry>([
      "files",
      "stat",
      JSON.stringify({ rootId: grant.id, path }),
      "--json",
    ]);
    const payload = JSON.stringify({
      rootId: grant.id,
      path,
      version: file.version,
      confirmed: true,
    });
    await expect(
      runCommand(parseCliArgs(["files", "delete", payload, "--json"]), { dataDir }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    expect(await readFile(join(authorized, path), "utf8")).toBe("keep until confirmed");
    expect(await invoke(["files", "delete", payload, "--json", "--yes"])).toEqual({
      deleted: true,
    });
    await expect(access(join(authorized, path))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["files", "roots", "unexpected"],
    ["files", "authorize", "/tmp", "unexpected"],
    ["jobs", "list", "{}", "unexpected"],
    ["tools", "run", "{}", "unexpected"],
  ])("rejects extra operands in %j", async (...args) => {
    await expect(runCommand(parseCliArgs(args), { dataDir })).rejects.toThrow(Error);
    await expect(access(dataDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["unknown", "list"],
    ["files", "unknown"],
    ["terminal", "open", "{}"],
    ["runtime", "info"],
  ])("rejects unknown or private commands in %j", async (...args) => {
    await expect(runCommand(parseCliArgs(args), { dataDir })).rejects.toThrow(Error);
    await expect(access(dataDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    { args: ["--help"], expected: "files" },
    { args: ["files", "--help"], expected: "authorize" },
    { args: ["files", "read", "--help"], expected: "read" },
    { args: ["stdio", "--help"], expected: "stdio" },
  ])("prints scoped help without creating a profile for $args", async ({ args, expected }) => {
    await runCommand(parseCliArgs(args), { dataDir, profile: "help-profile" });
    expect(output).toHaveBeenCalled();
    const help = output.mock.calls.map((call) => String(call[0])).join("\n");
    expect(help).toContain(expected);
    await expect(access(dataDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["--help", "--version"])(
    "treats %s after the delimiter as a directory operand instead of a global option",
    async (operand) => {
      await expect(
        runCommand(parseCliArgs(["files", "authorize", "--", operand]), { dataDir }),
      ).rejects.toThrow(Error);
      expect(output).not.toHaveBeenCalled();
    },
  );

  it("prints the standalone version without creating a profile", async () => {
    await runCommand(parseCliArgs(["--version"]), { dataDir });
    expect(output).toHaveBeenCalledExactlyOnceWith(manifest.version);
    await expect(access(dataDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["files", "roots", "--version"],
    ["--version", ""],
  ])(
    "rejects the version option when combined with positional arguments in %j",
    async (...args) => {
      await expect(runCommand(parseCliArgs(args), { dataDir })).rejects.toThrow(Error);
      expect(output).not.toHaveBeenCalled();
      await expect(access(dataDir)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("rejects an empty extra operand to stdio instead of starting the protocol", async () => {
    await expect(runCommand(parseCliArgs(["stdio", ""]), { dataDir })).rejects.toThrow(Error);
    expect(output).not.toHaveBeenCalled();
    await expect(access(dataDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["tui", "--json"],
    ["tui", "--yes"],
    ["tui", "unexpected"],
  ])("rejects invalid interactive invocation %j before opening a profile", async (...args) => {
    await expect(runCommand(parseCliArgs(args), { dataDir })).rejects.toThrow(Error);
    expect(output).not.toHaveBeenCalled();
    await expect(access(dataDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("prints TUI help without starting an interactive session", async () => {
    await runCommand(parseCliArgs(["tui", "--help"]), { dataDir });
    expect(output).toHaveBeenCalledOnce();
    expect(String(output.mock.calls[0]?.[0])).toContain("tui");
    await expect(access(dataDir)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
