import { afterEach, expect, it, vi } from "vitest";
import { mkdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import type { JobDefinition } from "@raypx/core/jobs";
import { aiFixture } from "../../helpers/ai.js";
import { startDaemon } from "../../helpers/enrolled.js";
import { runtimeFixtures } from "../../helpers/runtime.js";

const { fixture } = runtimeFixtures();
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  } finally {
    vi.unstubAllEnvs();
  }
});

async function setup(modelOptions?: Parameters<typeof aiFixture>[0]) {
  const { dir, grant, runtime, authorized } = await fixture();
  const reserved = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = reserved.port;
  await reserved.stop(true);
  const relayKey = "relay_fixture_key_0123456789_abcdefghij";
  const model = aiFixture(modelOptions);
  cleanups.push(() => model.stop());
  vi.stubEnv("RAYPX_HOME", dir);
  await writeFile(
    join(dir, "config.toml"),
    `
[ai]
provider = "local"
model = "fixture-model"
api = "openai-completions"
base_url = "${model.url}"

[routine_ingress]
port = ${port}
email_domain = "routines.example.com"
email_relay_key = "${relayKey}"
`,
  );
  runtime.agents.configure(grant.id, ["pi"]);
  const input = {
    projectId: grant.id,
    name: "External routine",
    action: { type: "agent.run", prompt: "Summarize the received event" },
    triggers: { webhook: true, email: { sender: "Operator@example.com" } },
  };
  const job = (await runtime.request("jobs.create", input)) as JobDefinition;
  await runtime.close();
  const boot = async () => {
    const host = await startDaemon({ dataDir: dir });
    cleanups.push(() => host.close());
    return host;
  };
  const host = await boot();
  const info = host.runtime.jobs.triggerInfo(job.id);
  if (!info.webhook || !info.email) throw new Error("Missing routine ingress configuration");
  return {
    host,
    boot,
    job,
    info: { webhook: info.webhook, email: info.email },
    relayKey,
    model,
    input,
    authorized,
  };
}

function post(url: string, key: string, body: unknown, id?: string) {
  return fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(id ? { "idempotency-key": id } : {}),
    },
    body: JSON.stringify(body),
  });
}

it("validates signed GitHub deliveries, filters repositories and events, and deduplicates redelivery", async () => {
  const { host, job, info, model, input } = await setup();
  await host.runtime.request("jobs.update", {
    ...input,
    id: job.id,
    triggers: {
      ...input.triggers,
      github: { repository: "Example/Project", events: ["push", "pull_request"] },
    },
  });
  const github = host.runtime.jobs.triggerInfo(job.id).github!;
  expect(github.key).not.toBe(info.webhook.key);
  const payload = {
    repository: { full_name: "Example/Project" },
    ref: "refs/heads/main",
    before: "a",
    after: "b",
    commits: [{ message: "not included" }],
  };
  const id = crypto.randomUUID();
  function send(
    event: string,
    value: unknown,
    key = github.key,
    delivery: string = crypto.randomUUID(),
    tampered = false,
  ) {
    const raw = JSON.stringify(value);
    const signature = createHmac("sha256", key).update(raw).digest("hex");
    return fetch(github.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": event,
        "x-github-delivery": delivery,
        "x-hub-signature-256": `sha256=${signature}`,
      },
      body: tampered ? raw + " " : raw,
    });
  }
  expect((await send("push", payload, info.webhook.key)).status).toBe(401);
  expect((await send("push", payload, github.key, id, true)).status).toBe(401);
  const ping = await send("ping", { zen: "Hello" });
  expect(ping.status).toBe(202);
  expect(await ping.json()).toEqual({ accepted: false });
  const wrong = await send("push", { ...payload, repository: { full_name: "Other/Project" } });
  expect(await wrong.json()).toEqual({ accepted: false });
  const filtered = await send("issues", {
    repository: payload.repository,
    action: "opened",
    issue: { number: 1, title: "Issue", html_url: "https://github.com/example/project/issues/1" },
  });
  expect(await filtered.json()).toEqual({ accepted: false });
  expect((await send("push", payload, github.key, id)).status).toBe(202);
  await expect.poll(() => host.runtime.jobs.history(job.id)[0]?.status).toBe("success");
  expect((await send("push", payload, github.key, id)).status).toBe(202);
  expect((await send("push", { ...payload, after: "c" }, github.key, id)).status).toBe(409);
  const history = host.runtime.jobs.history(job.id);
  expect(history).toMatchObject([{ trigger: "github", status: "success" }]);
  expect(model.requests).toHaveLength(1);
  expect(JSON.stringify(model.requests[0]?.body)).toContain("refs/heads/main");
  expect(JSON.stringify(model.requests[0]?.body)).not.toContain("not included");
  const rotated = host.runtime.jobs.rotateWebhook(job.id, "github");
  expect((await send("push", payload)).status).toBe(401);
  expect((await send("push", payload, rotated.key, id)).status).toBe(202);
  expect(host.runtime.jobs.triggerInfo(job.id).webhook?.key).toBe(info.webhook.key);
});

it("baselines project files, detects changes across restart, and baselines again after pause", async () => {
  const { host, boot, job, model, input, authorized } = await setup();
  const directory = join(authorized, "notes");
  const file = join(directory, "report.txt");
  await mkdir(directory);
  await writeFile(file, "before");
  const update = {
    ...input,
    id: job.id,
    triggers: { files: { path: "notes", intervalMinutes: 5 } },
  };
  await host.runtime.request("jobs.update", update);
  await expect.poll(() => host.runtime.state.fileWatch(job.id), { timeout: 3000 }).toBeDefined();
  expect(host.runtime.jobs.history(job.id)).toEqual([]);
  await host.close();

  await writeFile(file, "after!");
  const modified = await boot();
  await expect.poll(() => modified.runtime.jobs.history(job.id)[0]?.status).toBe("success");
  expect(modified.runtime.jobs.history(job.id)).toMatchObject([
    { trigger: "files", status: "success" },
  ]);
  const prompt = JSON.stringify(model.requests[0]?.body);
  expect(prompt).toContain("modified");
  expect(prompt).not.toContain("after!");
  expect(prompt).not.toContain(authorized);

  await modified.runtime.request("jobs.update", { ...update, enabled: false });
  expect(modified.runtime.state.fileWatch(job.id)).toBeUndefined();
  await rm(directory, { recursive: true });
  await modified.close();
  const resumed = await boot();
  expect(resumed.runtime.state.fileWatch(job.id)).toBeUndefined();
  await resumed.runtime.request("jobs.update", { ...update, enabled: true });
  await expect
    .poll(() => resumed.runtime.state.fileWatch(job.id), { timeout: 3000 })
    .toBe("missing");
  expect(resumed.runtime.jobs.history(job.id)).toHaveLength(1);
  expect(model.requests).toHaveLength(1);
});

it.skipIf(process.platform === "win32")(
  "ignores nested symlinks and rejects a symlink watch target",
  async () => {
    const { runtime, grant, authorized, dir } = await fixture();
    const { fileFingerprint } = await import("../../../src/runtime/files/fingerprint.js");
    const signal = new AbortController().signal;
    const outside = join(dir, "outside.txt");
    await writeFile(outside, "private");
    const original = await fileFingerprint(runtime.files, grant.id, "", signal);
    await symlink(outside, join(authorized, "link"));
    expect(await fileFingerprint(runtime.files, grant.id, "", signal)).toBe(original);
    await expect(fileFingerprint(runtime.files, grant.id, "link", signal)).rejects.toMatchObject({
      code: "SYMLINK",
    });
    runtime.state.removeRoot(grant.id);
    await expect(fileFingerprint(runtime.files, grant.id, "", signal)).rejects.toMatchObject({
      code: "ROOT_NOT_FOUND",
    });
  },
);

it("accepts a keyed webhook once, rotates the key and honors pause across daemon restart", async () => {
  const { host, boot, job, info, model, input } = await setup();
  const { url, key } = info.webhook;
  expect(job.nextRuns).toEqual([]);
  expect((await post(url, "x".repeat(43), {}, "invalid-key")).status).toBe(401);
  expect((await post(url, key, {}, undefined)).status).toBe(400);
  expect((await post(url, key, { event: "x".repeat(16_001) }, "oversized")).status).toBe(413);
  const payload = { event: "build-completed" };
  const attempts = await Promise.all([
    post(url, key, payload, "delivery-1"),
    post(url, key, payload, "delivery-1"),
  ]);
  expect(attempts.map((response) => response.status)).toEqual([202, 202]);
  await expect.poll(() => host.runtime.jobs.history(job.id)[0]?.status).toBe("success");
  const [run] = host.runtime.jobs.history(job.id);
  expect(run).toMatchObject({
    trigger: "webhook",
    session: { taskId: run?.id, projectId: job.projectId },
  });
  expect(host.runtime.agents.localTask(LOCAL_WORKSPACE_ID, run!.id, 0).task.prompt).toContain(
    "build-completed",
  );
  expect((await post(url, key, { event: "different" }, "delivery-1")).status).toBe(409);
  expect(model.requests).toHaveLength(1);
  const rotated = host.runtime.jobs.rotateWebhook(job.id);
  expect(rotated.key).not.toBe(key);
  expect((await post(url, key, {}, "delivery-2")).status).toBe(401);
  await host.close();
  const restarted = await boot();
  expect((await post(url, rotated.key, payload, "delivery-1")).status).toBe(202);
  expect(restarted.runtime.jobs.history(job.id)).toHaveLength(1);
  expect(model.requests).toHaveLength(1);
  await restarted.runtime.request("jobs.update", { ...input, id: job.id, enabled: false });
  expect((await post(url, rotated.key, {}, "delivery-2")).status).toBe(404);
  await restarted.runtime.request("jobs.update", {
    ...input,
    id: job.id,
    triggers: { email: input.triggers.email },
  });
  expect((await post(url, rotated.key, {}, "delivery-2")).status).toBe(401);
  expect(restarted.runtime.jobs.triggerInfo(job.id).webhook).toBeNull();
});

it("admits mail only from its authenticated relay and configured sender with a visible recipient", async () => {
  const { host, job, info, relayKey, model, authorized } = await setup({
    toolSequence: [
      {
        name: "files_write",
        arguments: { path: "mail.txt", text: "Approved report", version: null },
      },
      null,
    ],
  });
  const url = new URL("/routines/email", info.webhook.url).href;
  const body = {
    to: info.email,
    from: "Operator@example.com",
    recipients: [info.email],
    messageId: "<fixture@example.com>",
    subject: "Daily report",
    text: "The build is green.",
  };
  expect((await post(url, info.webhook.key, body)).status).toBe(401);
  for (const invalid of [
    { ...body, from: "someone@example.com" },
    { ...body, recipients: [] },
  ]) {
    const response = await post(url, relayKey, invalid);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: false });
  }
  expect(host.runtime.jobs.history(job.id)).toEqual([]);
  expect((await post(url, relayKey, body)).status).toBe(202);
  const live = host.runtime;
  await expect.poll(() => live.agents.localApprovals(LOCAL_WORKSPACE_ID)).toHaveLength(1);
  await expect(stat(join(authorized, "mail.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  const pending = live.agents.localApprovals(LOCAL_WORKSPACE_ID)[0]!;
  expect((await post(url, relayKey, { ...body, messageId: "next@example.com" })).status).toBe(503);
  expect(
    await live.agents.localExecute(LOCAL_WORKSPACE_ID, crypto.randomUUID(), {
      method: "approvals.decide",
      input: { id: pending.id, decision: { type: "allow" } },
    }),
  ).toMatchObject({ ok: true });
  await expect.poll(() => host.runtime.jobs.history(job.id)[0]?.status).toBe("success");
  expect((await post(url, relayKey, body)).status).toBe(202);
  expect(host.runtime.jobs.history(job.id)).toMatchObject([
    { trigger: "email", status: "success" },
  ]);
  expect(model.requests).toHaveLength(2);
  expect(await Bun.file(join(authorized, "mail.txt")).text()).toBe("Approved report");
  expect(JSON.stringify(model.requests[0]?.body)).toContain("The build is green.");
  expect(JSON.stringify(model.requests[0]?.body)).not.toContain(relayKey);
});
