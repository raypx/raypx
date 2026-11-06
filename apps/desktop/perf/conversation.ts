import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Context } from "@hona/strobe";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { stateFor } from "./fixture";

const fixtures = new Map<
  string,
  { close(): Promise<void>; task: string; project: string; seedNext(): void }
>();

/** Seed via the delivered CLI's public commands; no application source or production test hooks. */
export async function prepareConversation(ctx: Context<unknown>) {
  assert.ok(ctx.home);
  const state = await stateFor(ctx);
  let requests = 0;
  let seedNext = true;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      assert.equal(new URL(request.url).pathname, "/v1/chat/completions");
      assert.equal(request.headers.get("authorization"), null, "Fixture must use no provider key");
      await request.json();
      requests++;
      const first = seedNext;
      seedNext = false;
      let cancelled = false;
      return new Response(
        new ReadableStream({
          async start(controller) {
            const frame = (delta: Record<string, string>, finish_reason: string | null = null) =>
              controller.enqueue(
                new TextEncoder().encode(
                  "data: " +
                    JSON.stringify({
                      id: "synthetic-performance",
                      object: "chat.completion.chunk",
                      created: 0,
                      model: "fixture-model",
                      choices: [{ index: 0, delta, finish_reason }],
                    }) +
                    "\n\n",
                ),
              );
            try {
              frame({ role: "assistant", content: "" });
              for (let index = 0; index < (first ? 200 : 64); index++) {
                frame({
                  content:
                    `\n\n### Synthetic paragraph ${index + 1}\n` +
                    "Synthetic **conversation** 中文. ".repeat(8),
                });
                if (!first) await Bun.sleep(32);
              }
              if (!cancelled) {
                frame({}, "stop");
                controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                controller.close();
              }
            } catch (error) {
              if (!cancelled) controller.error(error);
            }
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  });
  const close = () => server.stop(true);
  const fixture = {
    close,
    task: "",
    project: "",
    seedNext: () => {
      seedNext = true;
    },
  };
  fixtures.set(ctx.home, fixture);
  const config = join(state.env.RAYPX_HOME!, "config.toml");
  const original = await readFile(config, "utf8");
  await writeFile(
    config,
    original +
      `\n[ai]\nprovider = "local"\nmodel = "fixture-model"\napi = "openai-completions"\nbase_url = "${server.url.origin}/v1"\n`,
  );
  const project = join(ctx.home, "synthetic-project");
  await mkdir(project, { recursive: true });
  const root = (await command(ctx, ["files", "authorize", project])) as { id: string };
  await command(ctx, [
    "tasks",
    "configure",
    JSON.stringify({ rootId: root.id, providers: ["pi"] }),
  ]);
  fixture.project = root.id;
  await seedConversation(ctx);
  assert.equal(requests, 1, "Synthetic SDK request did not reach the loopback fixture");
}
async function seedConversation(ctx: Context<unknown>) {
  const fixture = fixtures.get(ctx.home!);
  assert.ok(fixture?.project);
  fixture.seedNext();
  const id = crypto.randomUUID();
  await command(ctx, [
    "tasks",
    "create",
    JSON.stringify({
      id,
      projectId: fixture.project,
      provider: "pi",
      mode: "run",
      prompt: "Synthetic long conversation; no tools.",
    }),
  ]);
  fixture.task = id;
  await waitForTask(ctx, id);
  await openConversation(ctx);
}
async function waitForTask(ctx: Context<unknown>, id: string) {
  const deadline = performance.now() + 45_000;
  while (true) {
    const snapshot = (await command(ctx, ["tasks", "get", JSON.stringify({ id })])) as {
      task: { status: string };
    };
    if (snapshot.task.status === "succeeded") break;
    assert.ok(
      !["failed", "interrupted", "cancelled"].includes(snapshot.task.status),
      "Synthetic task failed",
    );
    assert.ok(performance.now() < deadline, "Synthetic task did not finish");
    await Bun.sleep(50);
  }
}
async function command(ctx: Context<unknown>, args: string[]) {
  assert.ok(ctx.home);
  const state = await stateFor(ctx);
  const child = Bun.spawn(
    [state.binary, ...args, "--data-dir", state.dataDir, "--profile", "strobe", "--json"],
    {
      env: state.env,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 45_000,
    },
  );
  const [stdout, , code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  assert.equal(code, 0, "Synthetic conversation CLI command failed");
  return JSON.parse(stdout) as unknown;
}
export async function openConversation(ctx: Context<unknown>) {
  const fixture = fixtures.get(ctx.home!);
  assert.ok(fixture?.task);
  await ctx.page.eval(
    (project: string, task: string) => {
      window.location.hash = "/tasks?scope=local&project=" + project + "&taskId=" + task;
    },
    fixture.project,
    fixture.task,
  );
  await ctx.page.waitFor("[data-conversation]", { timeout: 90_000 });
  await ctx.page.waitFor("textarea:not([required])", { timeout: 90_000 });
  await ctx.page.click("textarea:not([required])");
  await ctx.page.press("Control+a");
  await ctx.page.press("Backspace");
  await ctx.page.scroll("[data-conversation]", { by: 1_000_000 });
  await ctx.page.idle();
}
/** Each streaming run starts with one identical conversation, without accumulating task history. */
export async function resetConversation(ctx: Context<unknown>) {
  const fixture = fixtures.get(ctx.home!);
  assert.ok(fixture?.task);
  await waitForTask(ctx, fixture.task);
  const state = await stateFor(ctx);
  const child = Bun.spawn(
    [state.binary, "daemon", "proxy", "--data-dir", state.dataDir, "--profile", "strobe"],
    {
      env: state.env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
      timeout: 45_000,
    },
  );
  const id = crypto.randomUUID();
  await child.stdin.write(
    JSON.stringify({
      version: 1,
      id,
      method: "agents.local.clear",
      params: { accountId: LOCAL_WORKSPACE_ID },
    }) + "\n",
  );
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    let cleared = false;
    while (!cleared) {
      const { done, value } = await reader.read();
      assert.ok(!done, "Synthetic history reset exited before responding");
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop()!;
      for (const line of lines.filter(Boolean)) {
        const response = JSON.parse(line);
        if (response.id !== id) continue;
        assert.equal(
          response.result?.removed,
          1,
          "Synthetic history reset did not remove its task",
        );
        cleared = true;
      }
    }
  } finally {
    reader.releaseLock();
    await child.stdin.end();
    await child.exited;
  }
  await seedConversation(ctx);
}
export async function closeConversation(ctx: Context<unknown>) {
  const fixture = fixtures.get(ctx.home!);
  fixtures.delete(ctx.home!);
  await fixture?.close();
}
