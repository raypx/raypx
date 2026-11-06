import assert from "node:assert/strict";
import {
  copyFile,
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { terminalSmokeHost } from "../helpers/terminal-smoke";

if (process.env.RAYPX_LIVE_AGENTS !== "1")
  throw new Error("Set RAYPX_LIVE_AGENTS=1 to record real hook contracts");
const provider = process.argv[2];
if (provider !== "claude" && provider !== "codex") throw new Error("Select claude or codex");
const scenario = process.env.RAYPX_P0_DECISION ?? "allow";
const useTerminal = provider === "codex" || process.env.RAYPX_P0_TRANSPORT === "terminal";
if (!["allow", "deny", "fallback", "disconnected", "expired"].includes(scenario))
  throw new Error("Select allow, deny, fallback, disconnected or expired");
const expectsDecision = scenario === "allow" || scenario === "deny";
const delay = Number(process.env.RAYPX_P0_DELAY_MS ?? 0);
if (!Number.isInteger(delay) || delay < 0 || delay > 70_000)
  throw new Error("Test delay must be between 0 and 70000 ms");
const executable =
  process.env[provider === "claude" ? "RAYPX_CLAUDE_BINARY" : "RAYPX_CODEX_BINARY"] ??
  Bun.which(provider);
if (!executable) throw new Error("Set the provider binary explicitly or add it to PATH");
const directory = await mkdtemp(join(tmpdir(), "raypx-hook-contract-"));
await mkdir(join(directory, "project"));
const project = await realpath(join(directory, "project"));
const capture = join(directory, "hooks.jsonl");
const timers = new Set<ReturnType<typeof setTimeout>>();
const host = await terminalSmokeHost(
  join(directory, "host"),
  project,
  provider,
  scenario !== "fallback",
  scenario === "expired" ? 60 : 300,
  (request) => {
    if (request.status !== "pending") return;
    if (scenario === "disconnected") {
      clearInterval(heartbeat);
      return;
    }
    if (!expectsDecision) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      const allowed =
        request.kind === "permission" &&
        request.title === "Bash" &&
        JSON.parse(request.body).command === "printf RAYPX_TERMINAL_P0 > permission-marker.txt";
      void host
        .decide({
          id: request.id,
          epoch: request.epoch,
          revision: request.revision,
          receiptId: crypto.randomUUID(),
          decision:
            scenario === "allow" && allowed
              ? { type: "allow" }
              : { type: "deny", note: "P0 contract test declined this request" },
        })
        .catch(() => {});
    }, delay);
    timers.add(timer);
  },
);
let heartbeat: ReturnType<typeof setInterval> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let running: ReturnType<typeof Bun.spawn> | undefined;
try {
  await host.watch();
  heartbeat = setInterval(() => {
    void host.watch().catch(() => {});
  }, 2000);
  const recorder = resolve(import.meta.dirname, "../fixtures/terminal/capture-hook.ts");
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const command = `${quote(process.execPath)} ${quote(recorder)}`;
  const settings = join(directory, "settings.json");
  await writeFile(
    settings,
    JSON.stringify({
      hooks: {
        PermissionRequest: [
          { matcher: "Bash", hooks: [{ type: "command", command, timeout: 630 }] },
        ],
      },
    }),
    { mode: 0o600 },
  );
  const version = await Bun.$`${executable} --version`.text();
  const prompt =
    "Use the shell tool exactly once with this exact command: printf RAYPX_TERMINAL_P0 > permission-marker.txt . Do not use file-write or other tools. Then report success or the denial." +
    (provider === "codex"
      ? " You are in a read-only sandbox. Request approval/expanded permissions for this shell invocation before it runs; this is the purpose of the PermissionRequest hook test. Do not first try running it inside the read-only sandbox."
      : "");
  const env: Record<string, string | undefined> = {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: "1",
    RAYPX_HOME: join(directory, "raypx"),
    RAYPX_P0_PROVIDER: provider,
    RAYPX_P0_PROJECT: project,
    RAYPX_P0_CAPTURE: capture,
    RAYPX_P0_HOST: host.discoveryDirectory,
    RAYPX_P0_DECISION: scenario,
  };
  let args: string[];
  if (provider === "claude") {
    // Import only configured provider credentials, never the user's global hooks.
    try {
      const providerSettings = JSON.parse(
        await readFile(
          join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json"),
          "utf8",
        ),
      );
      for (const key of [
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_BASE_URL",
        "ANTHROPIC_MODEL",
      ]) {
        if (!env[key] && typeof providerSettings.env?.[key] === "string")
          env[key] = providerSettings.env[key];
      }
    } catch {
      /* Existing OS credential storage may already provide authentication. */
    }
    args = [
      "-p",
      prompt,
      "--permission-mode",
      "manual",
      "--settings",
      settings,
      "--setting-sources",
      "",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--max-budget-usd",
      "0.20",
      "--no-session-persistence",
    ];
    if (useTerminal) {
      const home = join(directory, "claude");
      await mkdir(home, { mode: 0o700 });
      env.CLAUDE_CONFIG_DIR = home;
      args = [
        prompt,
        "--permission-mode",
        "manual",
        "--settings",
        settings,
        "--setting-sources",
        "",
        "--no-chrome",
        "--disable-slash-commands",
      ];
    }
  } else {
    const home = join(directory, "codex");
    await mkdir(home, { mode: 0o700 });
    await copyFile(
      join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json"),
      join(home, "auth.json"),
    );
    await chmod(join(home, "auth.json"), 0o600);
    env.CODEX_HOME = home;
    const hooks = `[{matcher="Bash",hooks=[{type="command",command=${JSON.stringify(command)},timeout=630}]}]`;
    // This one-off automation flag vets only our recorder in a fresh home. Product
    // installation never uses it and still requires the user's /hooks review.
    args = [
      "--no-daemon",
      "--no-alt-screen",
      "--sandbox",
      "read-only",
      "--dangerously-bypass-hook-trust",
      "-a",
      "on-request",
      "-c",
      `projects.${JSON.stringify(project)}.trust_level="trusted"`,
      "-c",
      "check_for_update_on_startup=false",
      "-c",
      `hooks.PermissionRequest=${hooks}`,
      prompt,
    ];
  }
  let launch = [executable, ...args];
  if (useTerminal) {
    const spec = join(directory, "pty.json");
    await writeFile(
      spec,
      JSON.stringify({
        args: launch,
        cwd: project,
        provider,
        capture,
        decision: expectsDecision ? scenario : "fallback",
        screen: join(directory, "terminal.txt"),
      }),
      { mode: 0o600 },
    );
    launch = ["python3", resolve(import.meta.dirname, "../fixtures/terminal/driver.py"), spec];
  }
  const child = Bun.spawn(launch, {
    cwd: project,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  console.info(JSON.stringify({ provider, phase: "recording", directory }));
  running = child;
  timer = setTimeout(() => child.kill(), 120_000);
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timer);
  clearInterval(heartbeat);
  for (const approvalTimer of timers) clearTimeout(approvalTimer);
  await writeFile(
    join(directory, "broker-state.json"),
    JSON.stringify(await host.list(), null, 2),
    { mode: 0o600 },
  );
  if (provider === "codex") await rm(join(directory, "codex", "auth.json"), { force: true });
  await writeFile(join(directory, "session.jsonl"), stdout, { mode: 0o600 });
  await writeFile(join(directory, "stderr.txt"), stderr, { mode: 0o600 });
  const metadata = {
    provider,
    version: version.trim(),
    platform: process.platform,
    transport: "private-unix-request-broker",
    cliMode: useTerminal ? "terminal" : "print",
    hostMode: process.env.RAYPX_P0_HOST_MODE === "daemon" ? "daemon" : "standalone",
    recordedAt: new Date().toISOString(),
    exitCode: code,
    directory,
    scenario: `permission-${env.RAYPX_P0_DECISION}`,
  };
  await writeFile(join(directory, "metadata.json"), JSON.stringify(metadata, null, 2), {
    mode: 0o600,
  });
  console.info(JSON.stringify(metadata));
  assert.equal(code, 0, "Real CLI failed; inspect private capture artifacts");
  const records = (await readFile(capture, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.ok(
    records.some((record) => record.input?.hook_event_name === "PermissionRequest"),
    "No real permission hook was recorded",
  );
  assert.equal(
    records.filter((record) => record.input).length,
    1,
    "Expected exactly one tool invocation",
  );
  assert.equal(
    records.filter((record) => record.output).length,
    expectsDecision ? 1 : 0,
    "Expected a single decision or an empty fallback",
  );
  assert.equal(records.filter((record) => record.fallback).length, expectsDecision ? 0 : 1);
  if (scenario === "allow")
    assert.equal(
      await readFile(join(project, "permission-marker.txt"), "utf8"),
      "RAYPX_TERMINAL_P0",
    );
  else assert.equal(await Bun.file(join(project, "permission-marker.txt")).exists(), false);
  if (scenario === "disconnected" || scenario === "expired")
    assert.equal((await host.list())[0]?.status, scenario === "expired" ? "expired" : "cancelled");
  console.info(`Real ${provider} PermissionRequest ${env.RAYPX_P0_DECISION} contract passed`);
} finally {
  clearTimeout(timer);
  clearInterval(heartbeat);
  for (const approvalTimer of timers) clearTimeout(approvalTimer);
  await host.close();
  if (running && running.exitCode === null) {
    running.kill();
    await running.exited;
  }
  if (provider === "codex") await rm(join(directory, "codex", "auth.json"), { force: true });
}
