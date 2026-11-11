import { ProfileStorage } from "../../src/runtime/sqlite/index.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiRunner, type PiRunnerOptions } from "@raypx/providers/pi";
import { SqlitePiContextStore } from "../../src/runtime/agents/harness/context/sqlite.js";
import { piMessage, piModel, piScript, piTool } from "../helpers/pi.js";

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

// SDK orchestration fixture runs under the pinned development Bun. Delivery CLI is tested separately.
await fixture();
