import { expect, it } from "vite-plus/test";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentFixtures } from "../../../helpers/agents";
import type { AgentProvider } from "@raypx/contracts/tasks";
// Shortened from the production ten seconds; the races depend on ordering, not duration.
const interruptTimeoutMs = 1000;
const { host } = agentFixtures({ interruptTimeoutMs });

async function inputRace(
  scenario: "claude-timeout" | "claude-natural" | "codex-expired" | "codex-delayed",
) {
  const provider: AgentProvider = scenario.startsWith("claude") ? "claude" : "codex";
  const f = await host(provider, `${provider}-interactive`),
    account = "input-races",
    device = await f.runtime.localDevice(account);
  const input = {
    id: f.task.id,
    deviceId: device.id,
    projectId: f.task.projectId,
    provider,
    mode: "run" as const,
    prompt: "First",
  };
  await f.runtime.localExecute(account, input.id, { method: "tasks.create", input });
  await expect.poll(() => existsSync(join(f.directory, "delivered"))).toBe(true);
  const marker =
    scenario === "claude-timeout"
      ? "interrupt-without-result"
      : scenario === "claude-natural"
        ? "interrupt-natural-result"
        : scenario === "codex-delayed"
          ? "steer-expired-delayed"
          : "steer-expired";
  writeFileSync(join(f.directory, marker), "");
  const steer = {
    id: crypto.randomUUID(),
    taskId: input.id,
    mode: "steer" as const,
    prompt: "Next",
  };
  expect(
    await f.runtime.localExecute(account, steer.id, { method: "tasks.input", input: steer }),
  ).toMatchObject({ ok: true });
  return { ...f, account, input, steer };
}
it("ends a Claude interrupt without result after the interrupt timeout and releases the project lock", async () => {
  const f = await inputRace("claude-timeout");
  await expect
    .poll(() => f.runtime.localTask(f.account, f.input.id, 0).task.status, { timeout: 15_000 })
    .toBe("interrupted");
  expect(
    f.runtime.localTask(f.account, f.input.id, 0).activity.find((entry) => entry.id === f.steer.id),
  ).toMatchObject({ status: "failed", code: "INPUT_DELIVERY_FAILED" });
  const next = { ...f.input, id: crypto.randomUUID() };
  expect(
    await f.runtime.localExecute(f.account, next.id, { method: "tasks.create", input: next }),
  ).toMatchObject({ ok: true });
  await expect.poll(() => f.runtime.localTask(f.account, next.id, 0).task.status).toBe("running");
}, 30_000);
it("keeps a natural Claude result complete when it crosses an interrupt", async () => {
  const f = await inputRace("claude-natural");
  await expect
    .poll(
      () =>
        f.runtime
          .localTask(f.account, f.input.id, 0)
          .activity.filter((entry) => entry.kind === "input")
          .find((entry) => entry.id === f.steer.id)?.status,
    )
    .toBe("sent");
  expect(
    f.runtime.localTask(f.account, f.input.id, 0).activity.find((entry) => entry.kind === "message")
      ?.status,
  ).toBe("complete");
});
it("queues an explicitly rejected Codex steer after the completed turn", async () => {
  const f = await inputRace("codex-expired");
  await expect
    .poll(
      () =>
        f.runtime
          .localTask(f.account, f.input.id, 0)
          .activity.filter((entry) => entry.kind === "input")
          .find((entry) => entry.id === f.steer.id)?.status,
    )
    .toBe("sent");
  const delivered = readFileSync(join(f.directory, "delivered"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(delivered.filter((entry) => entry.method === "turn/start")).toHaveLength(2);
});
it("keeps two rejected Codex steers queued when completion outlasts the interrupt timeout", async () => {
  const f = await inputRace("codex-delayed");
  const activity = () =>
    f.runtime
      .localTask(f.account, f.input.id, 0)
      .activity.filter((entry) => entry.kind === "input");
  await expect
    .poll(() => activity().find((entry) => entry.id === f.steer.id)?.status)
    .toBe("queued");
  const second = { ...f.steer, id: crypto.randomUUID(), prompt: "Third" };
  expect(
    await f.runtime.localExecute(f.account, second.id, { method: "tasks.input", input: second }),
  ).toMatchObject({ ok: true });
  await expect
    .poll(() => activity().find((entry) => entry.id === second.id)?.status)
    .toBe("queued");
  await new Promise((resolve) => setTimeout(resolve, interruptTimeoutMs + 200));
  expect(f.runtime.localTask(f.account, f.input.id, 0).task.status).toBe("running");
  writeFileSync(join(f.directory, "complete"), "");
  const sent = () =>
    activity().filter(
      (entry) => (entry.id === f.steer.id || entry.id === second.id) && entry.status === "sent",
    ).length;
  await expect.poll(sent, { timeout: 5000 }).toBe(1);
  writeFileSync(join(f.directory, "complete"), "");
  await expect.poll(sent, { timeout: 5000 }).toBe(2);
  expect(f.runtime.localTask(f.account, f.input.id, 0).task.status).toBe("running");
}, 30_000);
it.each(["codex", "claude"] as const)(
  "delivers %s steer and queued turns once, in order, on the same session",
  async (provider) => {
    const { runtime, task, directory } = await host(provider, `${provider}-interactive`);
    const account = "interactive-user",
      device = await runtime.localDevice(account);
    const create = {
      id: task.id,
      deviceId: device.id,
      projectId: task.projectId,
      provider,
      mode: "run" as const,
      prompt: "First",
    };
    await runtime.localExecute(account, task.id, { method: "tasks.create", input: create });
    const delivered = () =>
      existsSync(join(directory, "delivered"))
        ? readFileSync(join(directory, "delivered"), "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
        : [];
    await expect.poll(() => delivered().length).toBe(1);
    // The child records stdin before replying to turn/start. Wait for the host's
    // first conversation projection before exercising input delivery.
    await expect
      .poll(() =>
        runtime.localTask(account, task.id, 0).activity.some((entry) => entry.kind === "message"),
      )
      .toBe(true);
    const input = (mode: "steer" | "queue", prompt: string) => ({
      id: crypto.randomUUID(),
      taskId: task.id,
      mode,
      prompt,
    });
    const queued = input("queue", "Second");
    const send = (value: ReturnType<typeof input>) =>
      runtime.localExecute(account, value.id, { method: "tasks.input", input: value });
    expect(await send(queued)).toMatchObject({ ok: true, value: { status: "queued" } });
    expect(await send(queued)).toMatchObject({ ok: true });
    expect(await send({ ...queued, prompt: "Changed identity" })).toEqual({
      ok: false,
      code: "IDEMPOTENCY_CONFLICT",
    });
    expect(delivered()).toHaveLength(1);
    expect(
      await runtime.localExecute("other", crypto.randomUUID(), {
        method: "tasks.input",
        input: input("queue", "Foreign"),
      }),
    ).toMatchObject({ ok: false });
    const steer = input("steer", "Adjust now");
    expect(await send(steer)).toMatchObject({ ok: true });
    await expect
      .poll(
        () =>
          runtime
            .localTask(account, task.id, 0)
            .activity.filter((entry) => entry.kind === "input")
            .find((entry) => entry.id === steer.id)?.status,
      )
      .toBe("sent");
    const expectedProtocol =
      provider === "codex"
        ? [{ method: "turn/steer", params: { expectedTurnId: "turn-1" } }]
        : [
            { type: "control_request", request: { subtype: "interrupt" } },
            { type: "user", session_id: "interactive", message: { content: "Adjust now" } },
          ];
    await expect
      .poll(() => delivered().slice(1, 1 + expectedProtocol.length))
      .toMatchObject(expectedProtocol);
    writeFileSync(join(directory, "complete"), "");
    await expect
      .poll(
        () =>
          runtime
            .localTask(account, task.id, 0)
            .activity.filter((entry) => entry.kind === "input")
            .find((entry) => entry.id === queued.id)?.status,
      )
      .toBe("sent");
    expect(runtime.localTask(account, task.id, 0).task.status).toBe("running");
    writeFileSync(join(directory, "complete"), "");
    await expect.poll(() => runtime.localTask(account, task.id, 0).task.status).toBe("succeeded");
    const result = runtime.localTask(account, task.id, 0);
    expect(
      result.activity.some((entry) => entry.kind === "message" && entry.text === "**Done**"),
    ).toBe(true);
    expect(result.activity.filter((entry) => entry.kind === "usage")).toHaveLength(2);
    expect(await send(queued)).toMatchObject({ ok: true });
    expect(
      delivered().filter(
        (entry) =>
          entry.params?.input?.[0]?.text === "Second" || entry.message?.content === "Second",
      ),
    ).toHaveLength(1);
  },
);
it("allows queueing during approval, blocks steer and cancels the durable queue when stopped", async () => {
  const { runtime, task } = await host("codex", "codex");
  const account = "queue-cancel",
    device = await runtime.localDevice(account);
  await runtime.localExecute(account, task.id, {
    method: "tasks.create",
    input: { ...task, deviceId: device.id },
  });
  await expect.poll(() => runtime.localApprovals(account).length).toBe(1);
  const steer = {
    id: crypto.randomUUID(),
    taskId: task.id,
    mode: "steer" as const,
    prompt: "Do not bypass approval",
  };
  expect(
    await runtime.localExecute(account, steer.id, { method: "tasks.input", input: steer }),
  ).toEqual({ ok: false, code: "INPUT_WAITING_APPROVAL" });
  const queue = { ...steer, id: crypto.randomUUID(), mode: "queue" as const };
  expect(
    await runtime.localExecute(account, queue.id, { method: "tasks.input", input: queue }),
  ).toMatchObject({ ok: true });
  await runtime.localExecute(account, crypto.randomUUID(), {
    method: "tasks.cancel",
    input: { id: task.id },
  });
  expect(
    runtime.localTask(account, task.id, 0).activity.find((entry) => entry.id === queue.id),
  ).toMatchObject({ status: "cancelled", code: "TASK_STOPPED" });
  expect(
    await runtime.localExecute(account, queue.id, { method: "tasks.input", input: queue }),
  ).toMatchObject({ ok: true });
});
