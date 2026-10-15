import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import manifest from "../package.json";

const dataDir = await mkdtemp(join(tmpdir(), "raypx-executable-smoke-"));
const binary = resolve(
  import.meta.dirname,
  "../dist",
  process.platform === "win32" ? "raypx.exe" : "raypx",
);
try {
  const version = Bun.spawn([binary, "--version"], {
    cwd: dataDir,
    env: { ...process.env, PATH: "" },
    stdout: "pipe",
    stderr: "pipe",
  });
  assert.equal((await new Response(version.stdout).text()).trim(), manifest.version);
  assert.equal(await version.exited, 0);
  const directory = join(dataDir, "authorized");
  await mkdir(directory);
  const authorize = Bun.spawn(
    [binary, "files", "authorize", directory, "--json", "--data-dir", dataDir],
    { cwd: dataDir, env: { ...process.env, PATH: "" }, stdout: "pipe", stderr: "pipe" },
  );
  const grant = JSON.parse(await new Response(authorize.stdout).text());
  assert.equal(await authorize.exited, 0);
  assert.equal(grant.path, await realpath(directory));
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
    assert.equal(response.result.runtime, "1.4.3");
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
    const shell =
      process.platform === "win32"
        ? (process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe")
        : "/bin/sh";
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
  } finally {
    clearTimeout(deadline);
    reader.releaseLock();
    child.kill();
  }
  console.log("Standalone CLI smoke passed outside the repository with an empty PATH.");
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
