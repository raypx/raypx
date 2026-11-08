import {
  writeResource,
  readJsonFile,
  readTextFile,
  fileExists,
  globFiles,
} from "@raypx/runtime-node/files";
import { spawnProcess, sleep } from "@raypx/runtime-node/process";
import { smokeManagedPi } from "./managed-pi.ts";
import { verifyCliPayload } from "@raypx/tooling/build/cli";
import { providerProxy } from "../helpers/provider-proxy.ts";
import { enrollTestProfile } from "../helpers/instance.ts";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { chmod, cp, mkdtemp, mkdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import manifest from "../../package.json";
import { aiFixture } from "../helpers/ai.ts";

const dataDir = await mkdtemp(join(tmpdir(), "raypx #完整运行目录 smoke-"));
const distribution = join(dataDir, "distribution");
const builtDirectory = resolve(
  process.env.RAYPX_CLI_PAYLOAD ?? resolve(import.meta.dirname, "../../dist"),
);
await verifyCliPayload(builtDirectory);
const binary = join(distribution, process.platform === "win32" ? "raypx.exe" : "raypx");
const launch = [binary];
function diagnostics(text: string) {
  return stripVTControlCharacters(text)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
function completed(text: string, mode: "command" | "stdio" | "version" | "tui", outcome: string) {
  const events = diagnostics(text).filter((event) => event.operation === "cli.completed");
  assert.equal(events.length, 1, "CLI completion must be flushed once to stderr");
  assert.equal(events[0]?.mode, mode);
  assert.equal(events[0]?.outcome, outcome);
  assert.equal(typeof events[0]?.elapsedMs, "number");
  assert.equal(events[0]?.level, outcome === "failed" ? "error" : "info");
}
let closeInstance = async () => {};
let closeProbe = async () => {};
const failures: unknown[] = [];
try {
  // Run the installed package outside the repository, with the embedded Bun runtime.
  await cp(builtDirectory, distribution, { recursive: true });
  const runtime = await readJsonFile(join(distribution, "runtime.json"));
  assert.equal(runtime.bunVersion, Bun.version);
  assert.equal(await fileExists(join(distribution, "runtime")), false);
  if (process.platform !== "win32") await chmod(binary, 0o700);
  closeInstance = await enrollTestProfile({ dataDir }, launch);
  const version = spawnProcess([...launch, "--version"], {
    cwd: dataDir,
    env: { ...process.env, PATH: "" },
    stdout: "pipe",
    stderr: "pipe",
  });
  assert.equal((await new Response(version.stdout).text()).trim(), manifest.version);
  assert.equal(await version.exited, 0);
  completed(await new Response(version.stderr).text(), "version", "success");
  if (process.platform === "darwin") {
    const home = join(dataDir, "connector-home"),
      state = join(home, "state"),
      claude = join(home, "claude"),
      codex = join(home, "codex");
    const invoke = async (args: string[], success = true) => {
      const child = spawnProcess([...launch, ...args, "--data-dir", state, "--json"], {
        cwd: dataDir,
        env: {
          ...process.env,
          PATH: "",
          RAYPX_HOME: home,
          CLAUDE_CONFIG_DIR: claude,
          CODEX_HOME: codex,
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      const code = /"code"\s*:\s*"([A-Z_]+)"/.exec(stderr)?.[1] ?? "unavailable";
      assert.equal(
        exit,
        success ? 0 : 1,
        `Connector lifecycle command ${args.join(" ")} failed (${code})`,
      );
      return { stdout, stderr };
    };
    await invoke(["connectors", "install", "claude"]);
    const stable = join(home, "bin", "raypx"),
      metadataFile = join(home, "bin", "installation.json");
    const metadata = await readJsonFile(metadataFile);
    assert.equal(metadata.version, manifest.version);
    assert.ok(metadata.builtAt > 0, "Standalone build identity must be embedded");
    let status = JSON.parse((await invoke(["connectors", "status"])).stdout)[0];
    assert.equal(status.installed, true);
    assert.equal(status.settingsFile, join(claude, "settings.json"));
    await rm(stable);
    status = JSON.parse((await invoke(["connectors", "status"])).stdout)[0];
    assert.equal(status.installed, false);
    assert.equal(status.error, "HOST_BINARY_MISSING");
    await invoke(["connectors", "install", "claude"]);
    const settingsBeforeRepair = await readTextFile(join(claude, "settings.json"));
    await writeResource(stable, "externally modified hook");
    status = JSON.parse((await invoke(["connectors", "status"])).stdout)[0];
    assert.equal(status.repairable, true);
    assert.ok(
      (await invoke(["connectors", "install", "claude"], false)).stderr.includes(
        "INSTALLATION_CONFLICT",
      ),
    );
    await invoke(["connectors", "repair", "claude"]);
    const backups = await Array.fromAsync(
      globFiles("raypx.backup-*", { cwd: join(home, "bin"), absolute: true }),
    );
    assert.equal(backups.length, 1);
    assert.equal(await readTextFile(backups[0]!), "externally modified hook");
    assert.equal(await readTextFile(join(claude, "settings.json")), settingsBeforeRepair);
    await writeResource(
      metadataFile,
      JSON.stringify({ ...metadata, builtAt: metadata.builtAt + 100000 }),
    );
    assert.ok(
      (await invoke(["connectors", "install", "claude"], false)).stderr.includes("HOST_DOWNGRADE"),
    );
    await writeResource(
      metadataFile,
      JSON.stringify({ ...metadata, version: "0.0.1", builtAt: 0 }),
    );
    try {
      await invoke(["daemon", "start"]);
      assert.equal(
        (await readJsonFile(metadataFile)).builtAt,
        metadata.builtAt,
        "Starting the bundled daemon updates its owned hook binary",
      );
    } finally {
      await invoke(["daemon", "stop"]);
    }
    await invoke(["connectors", "uninstall", "claude"]);
  }
  const aiHome = join(dataDir, "ai-home");
  for (const action of ["providers", "models"]) {
    const catalog = spawnProcess([...launch, "ai", action, "--json"], {
      cwd: dataDir,
      env: { ...process.env, PATH: "", RAYPX_HOME: aiHome },
      stdout: "pipe",
      stderr: "pipe",
    });
    const rows = JSON.parse(await new Response(catalog.stdout).text());
    assert.equal(await catalog.exited, 0);
    assert.ok(
      Array.isArray(rows) && rows.length > 0,
      "Pi catalogs must be embedded in the standalone CLI",
    );
    completed(await new Response(catalog.stderr).text(), "command", "success");
  }
  const proxy = await providerProxy(dataDir);
  closeProbe = () => proxy.close();
  await proxy.isolate(binary);
  const probeData = dataDir;
  const providerIds = ["anthropic", "openai", "google", "openrouter"];
  for (const provider of providerIds) {
    const catalog = spawnProcess(
      [...launch, "ai", "models", JSON.stringify({ provider }), "--json"],
      {
        cwd: dataDir,
        env: { ...process.env, PATH: "", RAYPX_HOME: aiHome },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const models = JSON.parse(await new Response(catalog.stdout).text()) as { id: string }[];
    await new Response(catalog.stderr).text();
    assert.equal(await catalog.exited, 0);
    assert.ok(models[0]);
    const requestCount = proxy.requests.length;
    const probe = spawnProcess(
      proxy.command(binary, [
        "ai",
        "complete",
        "--data-dir",
        probeData,
        JSON.stringify({
          provider,
          model: models[0].id,
          prompt: "private-provider-prompt",
          api_key_env: "RAYPX_PROVIDER_SMOKE_KEY",
          timeout_ms: 5000,
        }),
        "--json",
      ]),
      {
        cwd: dataDir,
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              ([key]) => !/^(?:RAYPX_|ANTHROPIC_|OPENAI_|GOOGLE_|GEMINI_|OPENROUTER_)/.test(key),
            ),
          ),
          HTTPS_PROXY: proxy.url,
          HTTP_PROXY: proxy.url,
          https_proxy: proxy.url,
          http_proxy: proxy.url,
          NODE_EXTRA_CA_CERTS: basename(proxy.cert),
          PATH: "",
          RAYPX_HOME: aiHome,
          RAYPX_PROVIDER_SMOKE_KEY: "synthetic-smoke-key",
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 15_000,
      },
    );
    const [output, errors, code] = await Promise.all([
      new Response(probe.stdout).text(),
      new Response(probe.stderr).text(),
      probe.exited,
    ]);
    assert.notEqual(code, 0);
    const safeErrors = errors
      .replaceAll("synthetic-smoke-key", "[redacted]")
      .replaceAll("private-provider-prompt", "[redacted]")
      .trim()
      .slice(-4096);
    assert.equal(
      proxy.requests.length,
      requestCount + 1,
      `${provider} must reach the TLS test proxy (exit ${code}, CONNECT ${proxy.connects.length}, TLS ${proxy.tlsErrors.join(",")}): ${safeErrors}`,
    );
    assert.ok(proxy.requests.at(-1)?.body.includes("private-provider-prompt"));
    assert.ok(proxy.requests.at(-1)?.credential.includes("synthetic-smoke-key"));
    assert.ok(!output.includes("private-provider-prompt"));
    assert.ok(!output.includes("synthetic-smoke-key"));
    assert.ok(!errors.includes("private-provider-prompt"));
    assert.ok(!errors.includes("synthetic-smoke-key"));
  }
  let bundledJsBytes = 0;
  for (const file of globFiles("**/*.mjs", {
    cwd: builtDirectory,
    absolute: true,
  }))
    bundledJsBytes += (await stat(file)).size;
  const reportDirectory = resolve(import.meta.dirname, "../../../../.artifacts/cli");
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(
    join(reportDirectory, "provider-smoke.json"),
    JSON.stringify(
      { providers: providerIds, binaryBytes: (await stat(binary)).size, bundledJsBytes },
      null,
      2,
    ),
  );
  const aiServer = aiFixture();
  try {
    const ai = spawnProcess(
      [
        ...launch,
        "ai",
        "complete",
        "--data-dir",
        dataDir,
        JSON.stringify({
          provider: "artifact",
          model: "fixture-model",
          api: "openai-completions",
          base_url: aiServer.url,
          prompt: "private-ai-prompt",
          api_key_env: "RAYPX_AI_SMOKE_KEY",
        }),
        "--json",
      ],
      {
        cwd: dataDir,
        env: { ...process.env, PATH: "", RAYPX_HOME: aiHome, RAYPX_AI_SMOKE_KEY: "private-ai-key" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const answer = JSON.parse(await new Response(ai.stdout).text());
    assert.equal(await ai.exited, 0);
    assert.ok(
      answer.content.some(
        (block: { type: string; text?: string }) =>
          block.type === "text" && block.text === "PI_AI_READY",
      ),
    );
    assert.equal(answer.usage.totalTokens, 16);
    assert.equal(aiServer.requests.length, 1);
    const aiDiagnostics = await new Response(ai.stderr).text();
    completed(aiDiagnostics, "command", "success");
    assert.ok(
      !aiDiagnostics.includes("private-ai-key") && !aiDiagnostics.includes("private-ai-prompt"),
    );
  } finally {
    await aiServer.stop();
  }
  if (process.platform !== "win32") {
    for (const [signal, exitCode] of [
      ["SIGINT", 130],
      ["SIGTERM", 143],
    ] as const) {
      const server = aiFixture({ stall: true });
      const child = spawnProcess(
        [
          ...launch,
          "ai",
          "complete",
          "--data-dir",
          dataDir,
          JSON.stringify({
            provider: "artifact",
            model: "fixture-model",
            api: "openai-completions",
            base_url: server.url,
            prompt: "private-ai-prompt",
          }),
          "--json",
        ],
        {
          cwd: dataDir,
          env: { ...process.env, PATH: "", RAYPX_HOME: aiHome },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const watchdog = setTimeout(() => child.kill("SIGKILL"), 10_000);
      try {
        const deadline = performance.now() + 5000;
        while (!server.requests.length && performance.now() < deadline) await sleep(10);
        assert.equal(server.requests.length, 1, "AI request must start before cancellation");
        child.kill(signal);
        assert.equal(
          await child.exited,
          exitCode,
          `${signal} must retain its conventional exit code`,
        );
        assert.equal(await new Response(child.stdout).text(), "");
        completed(await new Response(child.stderr).text(), "command", "failed");
      } finally {
        clearTimeout(watchdog);
        child.kill("SIGKILL");
        await server.stop();
      }
    }
  }
  await smokeManagedPi(launch, dataDir);
  const invalid = spawnProcess([...launch, "--json", "--profile"], {
    cwd: dataDir,
    env: { ...process.env, PATH: "" },
    stdout: "pipe",
    stderr: "pipe",
  });
  assert.equal(await new Response(invalid.stdout).text(), "");
  assert.equal(await invalid.exited, 1);
  const invalidDiagnostics = await new Response(invalid.stderr).text();
  assert.ok(diagnostics(invalidDiagnostics).some((event) => event.code === "LOCAL_ERROR"));
  completed(invalidDiagnostics, "command", "failed");
  for (const tuiArgs of [["tui"], ["tui", "--json"], ["tui", "--yes"]]) {
    const tui = spawnProcess(
      [...launch, ...tuiArgs, "--data-dir", join(dataDir, "not-interactive")],
      {
        cwd: dataDir,
        env: { ...process.env, PATH: "" },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    assert.equal(await new Response(tui.stdout).text(), "");
    assert.equal(await tui.exited, 1);
    const rejectedDiagnostics = await new Response(tui.stderr).text();
    assert.ok(
      diagnostics(rejectedDiagnostics).some((event) => event.code === "INTERACTIVE_REQUIRED"),
    );
    completed(rejectedDiagnostics, "tui", "failed");
    assert.equal(
      await fileExists(join(dataDir, "not-interactive", "profiles", "default", "profile.sqlite")),
      false,
    );
  }
  const help = spawnProcess([...launch, "stdio", "--help", "--data-dir", dataDir], {
    cwd: dataDir,
    env: { ...process.env, PATH: "" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const helpText = await new Response(help.stdout).text();
  assert.equal(await help.exited, 0);
  assert.ok(helpText.includes("stdio"), "Scoped help must describe the requested command");
  assert.ok(!helpText.includes('"event":'), "Help must not start the stdio protocol");
  completed(await new Response(help.stderr).text(), "command", "success");
  for (const invalidArgs of [["--unknown"], ["jobs", "list", "--json", "--json"]]) {
    const rejected = spawnProcess([...launch, ...invalidArgs], {
      cwd: dataDir,
      env: { ...process.env, PATH: "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    assert.equal(await new Response(rejected.stdout).text(), "");
    assert.equal(await rejected.exited, 1);
    const rejectedDiagnostics = await new Response(rejected.stderr).text();
    assert.ok(diagnostics(rejectedDiagnostics).some((event) => event.code === "LOCAL_ERROR"));
    completed(rejectedDiagnostics, "command", "failed");
  }
  const directory = join(dataDir, "authorized --help 工作 目录");
  await mkdir(directory);
  const authorize = spawnProcess(
    [...launch, "--data-dir", dataDir, "files", "--json", "authorize", "--", directory],
    { cwd: dataDir, env: { ...process.env, PATH: "" }, stdout: "pipe", stderr: "pipe" },
  );
  const grant = JSON.parse(await new Response(authorize.stdout).text());
  assert.equal(await authorize.exited, 0);
  assert.equal(grant.path, await realpath(directory));
  const authorizeDiagnostics = await new Response(authorize.stderr).text();
  completed(authorizeDiagnostics, "command", "success");
  assert.ok(!authorizeDiagnostics.includes(directory), "Diagnostics must omit private paths");
  const shell =
    process.platform === "win32"
      ? (process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe")
      : "/bin/sh";
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/c", "echo private-command-output"]
      : ["-c", "printf private-command-output"];
  const createJob = spawnProcess(
    [
      ...launch,
      "jobs",
      "create",
      JSON.stringify({
        name: "private-job-name",
        cron: "0 * * * *",
        timezone: "UTC",
        enabled: false,
        action: {
          type: "command.run",
          command: { executable: shell, args: commandArgs, cwd: dataDir, timeoutMs: 1000 },
        },
      }),
      "--json",
      "--data-dir",
      dataDir,
    ],
    { cwd: dataDir, env: { ...process.env, PATH: "" }, stdout: "pipe", stderr: "pipe" },
  );
  const job = JSON.parse(await new Response(createJob.stdout).text());
  assert.equal(await createJob.exited, 0);
  completed(await new Response(createJob.stderr).text(), "command", "success");
  const runJob = spawnProcess(
    [...launch, "jobs", "run", JSON.stringify({ id: job.id }), "--json", "--data-dir", dataDir],
    { cwd: dataDir, env: { ...process.env, PATH: "" }, stdout: "pipe", stderr: "pipe" },
  );
  const jobResult = JSON.parse(await new Response(runJob.stdout).text());
  assert.equal(await runJob.exited, 0);
  assert.equal(jobResult.status, "success");
  assert.ok(jobResult.output.includes("private-command-output"));
  const jobDiagnostics = await new Response(runJob.stderr).text();
  completed(jobDiagnostics, "command", "success");
  const summaries = diagnostics(jobDiagnostics).filter(
    (event) => event.operation === "job.completed",
  );
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.id, jobResult.id);
  assert.equal(summaries[0]?.jobId, job.id);
  assert.equal(summaries[0]?.status, "success");
  assert.ok(Number(summaries[0]?.elapsedMs) > 0, "Job summary must retain the operation duration");
  for (const privateValue of ["private-job-name", "private-command-output", dataDir, shell])
    assert.ok(!jobDiagnostics.includes(privateValue), "Diagnostics must omit private command data");
  const child = spawnProcess([...launch, "stdio", "--data-dir", dataDir], {
    cwd: dataDir,
    env: { ...process.env, PATH: "" },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  child.stdin.write(
    JSON.stringify({ version: 1, id: "smoke", method: "runtime.info", params: {} }) + "\n",
  );
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let output = "";
  const deadline = setTimeout(() => child.kill(), 10_000);
  try {
    while (!output.includes('"id":"smoke"')) {
      const part = await reader.read();
      if (part.done) throw new Error("Executable closed before handshake");
      output += decoder.decode(part.value, { stream: true });
    }
    const response = output
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((value) => value.id === "smoke");
    assert.equal(response.result.runtime, Bun.version);
    assert.equal(response.result.builtAt, runtime.builtAt);
    assert.equal(response.result.scheduler, true);
    const bunPath: unknown = response.result.bun;
    assert.ok(typeof bunPath === "string");
    const embedded = spawnProcess([bunPath, "--version"], {
      cwd: dataDir,
      env: { ...process.env, PATH: "" },
    });
    assert.equal((await new Response(embedded.stdout).text()).trim(), Bun.version);
    assert.equal(await embedded.exited, 0);
    child.stdin.write(
      JSON.stringify({ version: 1, id: "persisted", method: "roots.list", params: {} }) + "\n",
    );
    while (!output.includes('"id":"persisted"')) {
      const part = await reader.read();
      if (part.done) throw new Error("CLI exited early");
      output += decoder.decode(part.value, { stream: true });
    }
    const roots = output
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((value) => value.id === "persisted");
    assert.equal(roots.result[0].id, grant.id);
    const shellArgs =
      process.platform === "win32"
        ? ["/d", "/c", "echo raypx-pty"]
        : ["-c", "printf 'raypx-pty\\n'"];
    child.stdin.write(
      JSON.stringify({
        version: 1,
        id: "pty",
        method: "terminal.open",
        params: {
          executable: shell,
          args: shellArgs,
          cwd: dataDir,
          timeoutMs: 1000,
          cols: 80,
          rows: 24,
        },
      }) + "\n",
    );
    // Exercise the actual bundled Herdr with the delivered executable and an empty PATH.
    while (!output.includes('"id":"pty"')) {
      const part = await reader.read();
      if (part.done) throw new Error("CLI closed before terminal admission");
      output += decoder.decode(part.value, { stream: true });
    }
    const messages = () =>
      output
        .split("\n")
        .slice(0, -1)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    const opened = messages().find((value) => value.id === "pty");
    assert.ok(opened?.result?.id && !opened.error, "Bundled Herdr must admit the PTY");
    while (
      !messages().some(
        (value) => value.event === "terminal.exit" && value.data.id === opened.result.id,
      )
    ) {
      const part = await reader.read();
      if (part.done) throw new Error("CLI closed before the bundled PTY exited");
      output += decoder.decode(part.value, { stream: true });
    }
    assert.equal(
      messages().find(
        (value) => value.event === "terminal.exit" && value.data.id === opened.result.id,
      ).data.exitCode,
      0,
    );
    const toolId = crypto.randomUUID();
    child.stdin.write(
      JSON.stringify({
        version: 1,
        id: "cleanup",
        method: "tools.run",
        params: {
          id: toolId,
          executable: shell,
          args:
            process.platform === "win32"
              ? ["/d", "/c", "for /L %i in (1,0,2) do @rem"]
              : ["-c", "while :; do :; done"],
          cwd: dataDir,
          timeoutMs: 10000,
        },
      }) + "\n",
    );
    await sleep(100);
    child.stdin.end();
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      output += decoder.decode(part.value, { stream: true });
    }
    const cleanup = output
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((value) => value.id === "cleanup");
    assert.equal(cleanup.result.cancelled, true, "EOF did not cancel the managed command");
    assert.equal(await child.exited, 0);
    completed(await new Response(child.stderr).text(), "stdio", "success");
  } finally {
    clearTimeout(deadline);
    reader.releaseLock();
    child.kill();
  }
} catch (error) {
  failures.push(error);
} finally {
  for (const cleanup of [
    closeProbe,
    closeInstance,
    () => rm(dataDir, { recursive: true, force: true }),
  ]) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
}
if (failures.length) throw new AggregateError(failures, "CLI artifact smoke failed");
console.log(
  `Installed CLI smoke passed outside the repository with an empty PATH, including Pi AI streaming, managed tool approvals and daemon restart/resume.`,
);
