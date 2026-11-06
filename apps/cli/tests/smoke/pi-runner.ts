import { spawnProcess } from "@raypx/runtime-node/process";
import { ProfileStorage } from "../../src/runtime/sqlite/index.ts";
import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PiRunner, type PiRunnerOptions } from "@raypx/providers/pi";
import { SqlitePiContextStore } from "../../src/runtime/agents/harness/context/sqlite.ts";
import { piMessage, piModel, piScript, piTool } from "../helpers/pi.ts";

async function fixture() {
  // This is the real Agent loop with an offline stream; any accidental HTTP fails.
  globalThis.fetch = Object.assign(
    async () => {
      throw new Error("Network is disabled in this fixture");
    },
    {
      preconnect: () => {
        throw new Error("Network is disabled in this fixture");
      },
    },
  );
  const call = piMessage(
    [
      {
        type: "toolCall",
        id: "fixture-call",
        name: "fixture_tool",
        arguments: { value: "safe" },
      },
    ],
    "toolUse",
  );
  const script = piScript([
    call,
    piMessage([
      { type: "text", text: "Final one" },
      { type: "text", text: "Final two" },
    ]),
    piMessage([{ type: "text", text: "Resumed from durable context" }]),
    call,
  ]);
  let approved = false,
    executions = 0;
  const directory = await mkdtemp(join(tmpdir(), "raypx-pi-context-"));
  const storage = new ProfileStorage(directory);
  let store = new SqlitePiContextStore(storage.database, "fixture");
  try {
    const options: PiRunnerOptions = {
      model: piModel,
      stream: script.stream,
      store,
      authorize: async () => {
        approved = true;
        return "allow";
      },
      tools: [
        piTool(async (id) => {
          assert.ok(approved);
          assert.equal((await store.load()).pendingEffect?.id, id);
          executions++;
          return { content: [{ type: "text", text: "Approved fixture effect" }], details: {} };
        }),
      ],
    };
    assert.deepEqual(await new PiRunner(options).run("Offline Pi acceptance"), {
      status: "succeeded",
      text: "Final one\n\nFinal two",
    });
    const checkpoint = await store.load();
    assert.equal(checkpoint.status, "succeeded");
    assert.equal(checkpoint.pendingEffect, undefined);
    store.close();
    store = new SqlitePiContextStore(storage.database, "fixture");
    assert.deepEqual(await store.load(), checkpoint);
    const resumed = new PiRunner({ ...options, store });
    assert.deepEqual(await resumed.run("Continue after reopening SQLite"), {
      status: "succeeded",
      text: "Resumed from durable context",
    });
    assert.equal((await store.load()).messages.length > checkpoint.messages.length, true);
    assert.deepEqual(await resumed.run("Repeated effect"), {
      status: "failed",
      text: "",
      code: "PI_DUPLICATE_TOOL_CALL",
    });
    assert.equal(script.calls, 4);
    assert.equal(executions, 1);
    console.log(
      JSON.stringify({
        status: "ok",
        modelRequests: script.calls,
        toolExecutions: executions,
        durableResume: true,
        duplicateBlocked: true,
      }),
    );
  } finally {
    store.close();
    storage.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes("--fixture")) {
    await fixture();
  } else {
    const directory = await mkdtemp(join(tmpdir(), "raypx-pi-standalone-"));
    try {
      const isolated = join(directory, "isolated");
      const { build } = await import("vite-plus/pack");
      await build({
        config: false,
        entry: { fixture: fileURLToPath(import.meta.url) },
        outDir: isolated,
        platform: "node",
        format: "esm",
        fixedExtension: true,
        dts: false,
        deps: { alwaysBundle: [/.*/], neverBundle: [/^node:/, /^vite-plus(?:\/|$)/] },
      });
      const nodeName = process.platform === "win32" ? "node.exe" : "node";
      const binary = join(isolated, nodeName);
      await copyFile(process.execPath, binary);
      const entry = join(isolated, "fixture.mjs");
      const child = spawnProcess([binary, entry, "--fixture"], {
        cwd: isolated,
        env: {
          PATH: "",
          HOME: isolated,
          USERPROFILE: isolated,
          TMPDIR: directory,
          TEMP: directory,
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, status] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      assert.equal(status, 0, `Relocated Pi fixture failed\n${stdout}\n${stderr}`);
      assert.equal(stderr, "");
      const receipt: unknown = JSON.parse(stdout);
      assert.deepEqual(receipt, {
        status: "ok",
        modelRequests: 4,
        toolExecutions: 1,
        durableResume: true,
        duplicateBlocked: true,
      });
      console.log(
        JSON.stringify({
          standalone: "passed",
          nodeBytes: (await stat(binary)).size,
          entryBytes: (await stat(entry)).size,
          fixture: receipt,
          liveModels: "unverified",
        }),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Pi smoke failed");
  process.exitCode = 1;
});
