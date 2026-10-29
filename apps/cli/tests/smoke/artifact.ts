import assert from "node:assert/strict";
import { chmod, copyFile, mkdtemp, mkdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import manifest from "../../package.json";
import { aiFixture } from "../helpers/ai";

const { packageManager } = await Bun.file(
  resolve(import.meta.dirname, "../../../../package.json"),
).json();

const dataDir = await mkdtemp(join(tmpdir(), "raypx-executable-smoke-"));
const builtBinary = resolve(
  import.meta.dirname,
  "../../dist",
  process.platform === "win32" ? "raypx.exe" : "raypx",
);
const binary = join(dataDir, process.platform === "win32" ? "raypx.exe" : "raypx");
function diagnostics(text: string) {
  return text
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
try {
  // Only the executable leaves dist: lazy imports must be inside this one file.
  await copyFile(builtBinary, binary);
  if (process.platform !== "win32") await chmod(binary, 0o700);
  const version = Bun.spawn([binary, "--version"], {
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
      const child = Bun.spawn([binary, ...args, "--data-dir", state, "--json"], {
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
      assert.equal(exit, success ? 0 : 1, `Connector lifecycle command ${args.join(" ")} failed`);
      return { stdout, stderr };
    };
    await invoke(["connectors", "install", "claude"]);
    const stable = join(home, "bin", "raypx"),
      metadataFile = join(home, "bin", "installation.json");
    const metadata = await Bun.file(metadataFile).json();
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
    const settingsBeforeRepair = await Bun.file(join(claude, "settings.json")).text();
    await Bun.write(stable, "externally modified hook");
    status = JSON.parse((await invoke(["connectors", "status"])).stdout)[0];
    assert.equal(status.repairable, true);
    assert.ok(
      (await invoke(["connectors", "install", "claude"], false)).stderr.includes(
        "INSTALLATION_CONFLICT",
      ),
    );
    await invoke(["connectors", "repair", "claude"]);
    const backups = await Array.fromAsync(
      new Bun.Glob("raypx.backup-*").scan({ cwd: join(home, "bin"), absolute: true }),
    );
    assert.equal(backups.length, 1);
    assert.equal(await Bun.file(backups[0]!).text(), "externally modified hook");
    assert.equal(await Bun.file(join(claude, "settings.json")).text(), settingsBeforeRepair);
    await Bun.write(
      metadataFile,
      JSON.stringify({ ...metadata, builtAt: metadata.builtAt + 100000 }),
    );
    assert.ok(
      (await invoke(["connectors", "install", "claude"], false)).stderr.includes("HOST_DOWNGRADE"),
    );
    await Bun.write(metadataFile, JSON.stringify({ ...metadata, version: "0.0.1", builtAt: 0 }));
    try {
      await invoke(["daemon", "start"]);
      assert.equal(
        (await Bun.file(metadataFile).json()).builtAt,
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
    const catalog = Bun.spawn([binary, "ai", action, "--json"], {
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
  // Compile the exact production JS/chunks behind an offline fetch harness. This
  // exercises lazy SDK initialization without adding a test hook to the product.
  const marker = join(dataDir, "provider-fetch"),
    bootstrap = join(dataDir, "provider-probe.ts");
  await writeFile(
    bootstrap,
    `globalThis.fetch = async () => { await Bun.write(${JSON.stringify(marker)}, "reached"); return Response.json({error:{code:401,message:"Unauthenticated",status:"UNAUTHENTICATED"}},{status:401}); }; await import(${JSON.stringify(resolve(import.meta.dirname, "../../dist/main.mjs"))});`,
  );
  const probeBinary = join(
    dataDir,
    process.platform === "win32" ? "provider-probe.exe" : "provider-probe",
  );
  const probeBuild = await Bun.build({
    entrypoints: [bootstrap],
    compile: { outfile: probeBinary },
    target: "bun",
    format: "esm",
    bytecode: true,
  });
  assert.ok(probeBuild.success, "Default provider chunks must compile into the offline probe");
  const providerIds = ["anthropic", "openai", "google", "openrouter"];
  for (const provider of providerIds) {
    const catalog = Bun.spawn([binary, "ai", "models", JSON.stringify({ provider }), "--json"], {
      cwd: dataDir,
      env: { ...process.env, PATH: "", RAYPX_HOME: aiHome },
      stdout: "pipe",
      stderr: "pipe",
    });
    const models = JSON.parse(await new Response(catalog.stdout).text()) as { id: string }[];
    await new Response(catalog.stderr).text();
    assert.equal(await catalog.exited, 0);
    assert.ok(models[0]);
    await rm(marker, { force: true });
    const probe = Bun.spawn(
      [
        probeBinary,
        "ai",
        "complete",
        JSON.stringify({
          provider,
          model: models[0].id,
          prompt: "offline loading probe",
          api_key_env: "RAYPX_PROVIDER_SMOKE_KEY",
        }),
        "--json",
      ],
      {
        cwd: dataDir,
        env: {
          ...process.env,
          PATH: "",
          RAYPX_HOME: aiHome,
          RAYPX_PROVIDER_SMOKE_KEY: "synthetic-smoke-key",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    await new Response(probe.stdout).text();
    const errors = await new Response(probe.stderr).text();
    assert.notEqual(await probe.exited, 0);
    assert.equal(
      await Bun.file(marker).text(),
      "reached",
      `${provider} must load its compiled SDK and reach the offline transport`,
    );
    assert.ok(!errors.includes("synthetic-smoke-key"));
  }
  let bundledJsBytes = 0;
  for await (const file of new Bun.Glob("**/*.mjs").scan({
    cwd: resolve(import.meta.dirname, "../../dist"),
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
    const ai = Bun.spawn(
      [
        binary,
        "ai",
        "complete",
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
      const child = Bun.spawn(
        [
          binary,
          "ai",
          "complete",
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
        while (!server.requests.length && performance.now() < deadline) await Bun.sleep(10);
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
  const invalid = Bun.spawn([binary, "--json", "--profile"], {
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
    const tui = Bun.spawn([binary, ...tuiArgs, "--data-dir", join(dataDir, "not-interactive")], {
      cwd: dataDir,
      env: { ...process.env, PATH: "" },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    assert.equal(await new Response(tui.stdout).text(), "");
    assert.equal(await tui.exited, 1);
    const rejectedDiagnostics = await new Response(tui.stderr).text();
    assert.ok(
      diagnostics(rejectedDiagnostics).some((event) => event.code === "INTERACTIVE_REQUIRED"),
    );
    completed(rejectedDiagnostics, "tui", "failed");
    assert.equal(
      await Bun.file(
        join(dataDir, "not-interactive", "profiles", "default", "state.sqlite"),
      ).exists(),
      false,
    );
  }
  const help = Bun.spawn([binary, "stdio", "--help", "--data-dir", dataDir], {
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
    const rejected = Bun.spawn([binary, ...invalidArgs], {
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
  const authorize = Bun.spawn(
    [binary, "--data-dir", dataDir, "files", "--json", "authorize", "--", directory],
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
  const createJob = Bun.spawn(
    [
      binary,
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
  const runJob = Bun.spawn(
    [binary, "jobs", "run", JSON.stringify({ id: job.id }), "--json", "--data-dir", dataDir],
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
  const child = Bun.spawn([binary, "stdio", "--data-dir", dataDir], {
    cwd: dataDir,
    env: { ...process.env, PATH: "", RAYPX_HERDR_BINARY: join(dataDir, "missing-herdr") },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  await child.stdin.write(
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
    assert.equal(`bun@${response.result.runtime}`, packageManager);
    assert.equal(response.result.scheduler, true);
    const bunShim: unknown = response.result.bun;
    assert.ok(typeof bunShim === "string", "runtime.info must report the bundled Bun shim");
    assert.ok((await Bun.file(bunShim).text()).includes(binary), "Shim must run this executable");
    if (process.platform !== "win32") {
      const script = join(dataDir, "bundled-bun.ts");
      await writeFile(script, "console.log(`bundled-bun ${Bun.version}`)");
      const bun = Bun.spawn([bunShim, "run", script], {
        cwd: dataDir,
        env: { ...process.env, PATH: "" },
        stdout: "pipe",
        stderr: "pipe",
      });
      assert.equal(await bun.exited, 0, "Bundled Bun must run scripts without an installed Bun");
      assert.equal(
        `bun@${(await new Response(bun.stdout).text()).trim().replace("bundled-bun ", "")}`,
        packageManager,
      );
    }
    await child.stdin.write(
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
    await child.stdin.write(
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
    // Real PTY/frame coverage belongs to smoke:herdr-terminal with the staged
    // native runtime. Default verification deliberately has no Herdr installation.
    while (!output.includes('"id":"pty"')) {
      const part = await reader.read();
      if (part.done) throw new Error("CLI closed before terminal admission");
      output += decoder.decode(part.value, { stream: true });
    }
    const events = output
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(
      events.find((value) => value.id === "pty").error.code,
      "TERMINAL_HOST_UNAVAILABLE",
    );
    const toolId = crypto.randomUUID();
    await child.stdin.write(
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
    await Bun.sleep(100);
    await child.stdin.end();
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
  console.log(
    "Copied standalone CLI smoke passed outside the repository with an empty PATH, including Pi AI HTTP streaming.",
  );
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
