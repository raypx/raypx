import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const bun = execFileSync(
  "bun",
  ["--no-env-file", "--no-install", "-e", "process.stdout.write(process.execPath)"],
  {
    encoding: "utf8",
  },
).trim();

async function invoke(args: string[], entry = "scripts/bin/raypx.ts") {
  const directory = await mkdtemp(join(tmpdir(), "raypx-consumer-cli-"));
  try {
    const guard = join(directory, "bin");
    await mkdir(guard);
    // Run the source CLI with absolute Bun, but reject any attempted preparation subprocess.
    await writeFile(
      join(guard, "bun"),
      "#!/bin/sh\nprintf 'UNEXPECTED_CONSUMER_PREPARATION\\n' >&2\nexit 97\n",
      { mode: 0o755 },
    );
    const result = spawnSync(
      bun,
      ["--no-env-file", "--no-install", join(repository, entry), ...args],
      {
        cwd: directory,
        encoding: "utf8",
        timeout: 5000,
        env: {
          PATH: `${guard}${delimiter}${process.env.PATH ?? ""}`,
          HOME: directory,
          // A fixture cannot be created here: CLI-only requests must not reach mkdtemp.
          TMPDIR: join(directory, "no-fixtures"),
          SystemRoot: process.env.SystemRoot,
          NODE_ENV: "test",
          CI: "true",
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(await readdir(directory)).not.toContain("no-fixtures");
    expect(result.stdout).not.toContain("Preparing consumer artifacts");
    expect(result.stdout).not.toContain("Development environment passed");
    expect(result.stdout).not.toContain("installed locked artifacts");
    expect(result.stderr).not.toContain("UNEXPECTED_CONSUMER_PREPARATION");
    expect(result.stderr).not.toContain("ENOENT");
    return result;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test.each([{ args: [] }, { args: ["--help"] }, { args: ["-h"] }])(
  "unified bin renders root help for $args without preparation",
  async ({ args }) => {
    const result = await invoke(args);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("USAGE");
    for (const name of ["doctor", "env", "setup", "consumer", "consumer-browser"]) {
      expect(result.stdout).toContain(name);
    }
    expect(result.stderr).toBe("");
  },
);

test.each([
  { args: ["unknown", "--help"] },
  { args: ["--unknown", "consumer"] },
  { args: ["--help", "consumer"] },
])("unified bin rejects root arguments $args", async ({ args }) => {
  const result = await invoke(args);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Unknown command or root option");
  expect(result.stdout).toBe("");
});

describe.each(["consumer", "consumer-browser"])("raypx %s", (command) => {
  test.each(["--help", "-h"])("renders %s without preparing a fixture", async (flag) => {
    const result = await invoke([command, flag]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("USAGE");
    expect(result.stdout).toContain(`raypx ${command}`);
    expect(result.stderr).toBe("");
    expect(result.stdout.includes("--kind")).toBe(command === "consumer");
  });

  test.each([
    { args: ["--unknown"], message: "Unknown option '--unknown'" },
    { args: ["unexpected"], message: "Unexpected argument 'unexpected'" },
    { args: ["--help", "--unknown"], message: "Unknown option '--unknown'" },
  ])("rejects $args before preparation", async ({ args, message }) => {
    const result = await invoke([command, ...args]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(result.stderr.split(message)).toHaveLength(2);
    expect(result.stdout).toBe("");
  });
});

test.each([
  { args: ["--kind", "invalid"], message: "Invalid value for argument" },
  { args: ["--kind"], message: "argument missing" },
  { args: ["--kind", "core", "--kind", "browser"], message: "Specify --kind only once" },
  { args: ["--no-kind"], message: "Unknown option '--no-kind'" },
])("consumer rejects $args without preparation", async ({ args, message }) => {
  const result = await invoke(["consumer", ...args]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(message);
  expect(result.stderr.split(message)).toHaveLength(2);
});

test("browser consumer rejects kind selection", async () => {
  const result = await invoke(["consumer-browser", "--kind", "core"]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Unknown option '--kind'");
});

test.each([
  { entry: "scripts/check-consumer.ts", command: "consumer" },
  { entry: "scripts/test-consumer-browser.ts", command: "consumer-browser" },
])("$entry delegates to unified help and strict validation", async ({ entry, command }) => {
  const help = await invoke(["--help"], entry);
  expect(help.status).toBe(0);
  expect(help.stdout).toContain(`raypx ${command}`);
  expect(help.stderr).toBe("");
  const invalid = await invoke(["--unknown"], entry);
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).toContain("Unknown option '--unknown'");
});
