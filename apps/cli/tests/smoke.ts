import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import manifest from "../package.json";

const { packageManager } = await Bun.file(
  resolve(import.meta.dirname, "../../../package.json"),
).json();

const dataDir = await mkdtemp(join(tmpdir(), "raypx-executable-smoke-"));
const binary = resolve(
  import.meta.dirname,
  "../dist",
  process.platform === "win32" ? "raypx.exe" : "raypx",
);
function diagnostics(text: string) {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
function completed(text: string, mode: "command" | "stdio" | "version", outcome: string) {
  const events = diagnostics(text).filter((event) => event.operation === "cli.completed");
  assert.equal(events.length, 1, "CLI completion must be flushed once to stderr");
  assert.equal(events[0]?.mode, mode);
  assert.equal(events[0]?.outcome, outcome);
  assert.equal(typeof events[0]?.elapsedMs, "number");
  assert.equal(events[0]?.level, outcome === "failed" ? "error" : "info");
}
try {
  const version = Bun.spawn([binary, "--version"], {
    cwd: dataDir,
    env: { ...process.env, PATH: "" },
    stdout: "pipe",
    stderr: "pipe",
  });
  assert.equal((await new Response(version.stdout).text()).trim(), manifest.version);
  assert.equal(await version.exited, 0);
  completed(await new Response(version.stderr).text(), "version", "success");
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
  const directory = join(dataDir, "authorized");
  await mkdir(directory);
  const authorize = Bun.spawn(
    [binary, "files", "authorize", directory, "--json", "--data-dir", dataDir],
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
    env: { ...process.env, PATH: "" },
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
    while (!output.includes('"event":"terminal.exit"')) {
      const part = await reader.read();
      if (part.done) throw new Error("CLI closed before PTY completion");
      output += decoder.decode(part.value, { stream: true });
    }
    const events = output
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.ok(
      events.some(
        (value) =>
          value.event === "terminal.output" &&
          Buffer.from(value.data.data, "base64").toString().includes("raypx-pty"),
      ),
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
  console.log("Standalone CLI smoke passed outside the repository with an empty PATH.");
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
