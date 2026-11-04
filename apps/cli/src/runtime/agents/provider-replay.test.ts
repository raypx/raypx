import { expect, it, vi } from "vite-plus/test";
import type { ReplayRecord } from "../../../tests/helpers/provider-replay";
import { bootstrap, late, fixture } from "../../../tests/helpers/provider-session";

it.each(["codex", "claude"] as const)(
  "replays %s resume and a durable queued turn, retaining the lock through drain",
  async (provider) => {
    const f = fixture(provider);
    await f.replay.wait("started");
    await f.running;
    expect(f.local.sessionId).toBe("synthetic-session");
    expect(provider !== "claude" || f.replay.launches[0]!.args.includes("--resume")).toBe(true);
    const input = f.execution.enqueue({
      id: crypto.randomUUID(),
      mode: "queue",
      prompt: "Queued synthetic input",
    });
    expect(input.status).toBe("queued");
    f.replay.release("started");
    await f.replay.wait("queued");
    await f.waitActivity(input.id, "sent");
    expect(f.inputStatus(input.id)).toBe("sent");
    expect(f.unlock).not.toHaveBeenCalled();
    f.replay.release("queued");
    await f.replay.wait("draining");
    const drained = vi.fn();
    void f.replay.drain().then(drained);
    expect(f.unlock).not.toHaveBeenCalled();
    expect(drained).not.toHaveBeenCalled();
    f.replay.release("draining");
    await f.finished();
    expect(f.local.task.status).toBe("succeeded");
    expect(f.unlock).toHaveBeenCalledTimes(1);
    expect(f.ended).toHaveBeenCalledTimes(1);
  },
);

it.each(["codex", "claude"] as const)(
  "arbitrates %s approval once and ignores late events and decisions after cancellation",
  async (provider) => {
    const records: ReplayRecord[] = [
      ...bootstrap(provider),
      { direction: "host", channel: "kill" },
      late(provider),
      { direction: "gate", name: "draining" },
      { direction: "exit", code: 0 },
      late(provider),
    ];
    const f = fixture(provider, records);
    await f.replay.wait("started");
    await f.running;
    const answer = f.execution.ask("permission", "Synthetic permission", "Synthetic command");
    const request = [...f.requests.values()][0]!;
    f.execution.applyDecision(request.id, { type: "allow" });
    f.execution.applyDecision(request.id, { type: "deny", note: "Competing answer" });
    expect(await answer).toEqual({ type: "allow" });
    expect(f.requests.get(request.id)?.decision).toEqual({ type: "allow" });
    const pending = f.execution.ask("permission", "Pending permission", "Synthetic command");
    const pendingRequest = [...f.requests.values()].at(-1)!;
    f.execution.cancel();
    f.execution.applyDecision(pendingRequest.id, { type: "allow" });
    expect(await pending).toEqual({ type: "deny", note: "Task stopped" });
    f.replay.release("started");
    await f.replay.wait("draining");
    expect(f.unlock).not.toHaveBeenCalled();
    f.replay.release("draining");
    await f.finished();
    expect(f.local.task.status).toBe("cancelled");
    expect(f.local.sessionId).toBe("synthetic-session");
    expect(
      [...f.activity.values()].some(
        (entry) => entry.kind === "message" && entry.text.includes("Stale"),
      ),
    ).toBe(false);
    expect(f.unlock).toHaveBeenCalledTimes(1);
  },
);

it.each(["codex", "claude"] as const)(
  "settles %s unexpected process exit once and fences subsequent protocol output",
  async (provider) => {
    const f = fixture(provider, [
      ...bootstrap(provider),
      { direction: "exit", code: 1 },
      { direction: "host", channel: "kill" },
      late(provider),
    ]);
    await f.replay.wait("started");
    await f.running;
    f.replay.release("started");
    await f.finished();
    expect(f.local.task.status).toBe("failed");
    expect(f.local.task.summary).toBe("AGENT_EXITED");
    expect(f.local.sessionId).toBe("synthetic-session");
    expect(f.unlock).toHaveBeenCalledTimes(1);
  },
);
