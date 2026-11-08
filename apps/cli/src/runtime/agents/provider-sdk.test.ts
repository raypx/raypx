import type { SessionFactory } from "@raypx/providers/core";
import { expect, it, vi } from "vite-plus/test";
import { memoryConversation, fixture } from "../../../tests/helpers/provider-session.ts";

it("runs an in-process SDK session and holds its project lock until effects drain", async () => {
  const conversation = memoryConversation();
  let drain!: () => void, closing!: () => void;
  const drained = new Promise<void>((resolve) => {
    drain = resolve;
  });
  const closeStarted = new Promise<void>((resolve) => {
    closing = resolve;
  });
  const factory: SessionFactory = (start, ports) => {
    expect(start.directory).toBe("/synthetic-project");
    expect("executable" in start).toBe(false);
    const handle = {
      completed: drained,
      kill: async () => {
        closing();
        await drained;
      },
    };
    return {
      handle,
      input: "steer",
      holdPlanOnExit: false,
      planContinuation: "turn",
      planTitle: "SDK fixture",
      turnId: "sdk-turn",
      preview: "",
      summary: "",
      initialize: async () => "synthetic-session",
      sendTurn: async () => {
        ports.emit({
          type: "activity",
          handle,
          event: { type: "message", id: "sdk-message", text: "SDK result", complete: true },
        });
        ports.emit({
          type: "completed",
          handle,
          status: "completed",
          summary: "SDK result",
          preview: "SDK result",
          turnId: "sdk-turn",
        });
      },
      steer: async () => {},
      interrupt: async () => {},
    };
  };
  const f = fixture("codex", [], { factory, conversation });
  await f.running;
  await closeStarted;
  expect(f.unlock).not.toHaveBeenCalled();
  expect(conversation.record).toHaveBeenCalledWith({
    type: "message",
    id: "sdk-message",
    text: "SDK result",
    complete: true,
  });
  drain();
  await f.finished();
  expect(f.unlock).toHaveBeenCalledTimes(1);
  expect(f.local.task.status).toBe("succeeded");
});

it("commits an SDK approval before inference resumes through in-memory ports", async () => {
  const conversation = memoryConversation();
  let drained!: () => void, requested!: () => void;
  const completed = new Promise<void>((resolve) => {
    drained = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    requested = resolve;
  });
  let observed:
    | { status: string | undefined; decision: unknown; savedDecision: unknown }
    | undefined;
  const factory: SessionFactory = (_start, ports) => {
    const handle = {
      completed,
      kill: async () => {
        drained();
      },
    };
    return {
      handle,
      input: "steer",
      holdPlanOnExit: false,
      planContinuation: "turn",
      planTitle: "SDK fixture",
      turnId: "sdk-approval-turn",
      preview: "",
      summary: "",
      initialize: async () => "synthetic-session",
      sendTurn: async () => {
        const answer = ports.approval.ask(
          "permission",
          "SDK permission",
          "Allow a synthetic action?",
        );
        requested();
        const decision = await answer;
        const request = [...f.requests.values()][0];
        observed = { status: request?.status, decision, savedDecision: request?.decision };
        ports.emit({
          type: "completed",
          handle,
          status: "completed",
          summary: "SDK approved",
          preview: "",
          turnId: "sdk-approval-turn",
        });
      },
      steer: async () => {},
      interrupt: async () => {},
    };
  };
  const f = fixture("codex", [], { factory, conversation });
  await waiting;
  const request = [...f.requests.values()][0]!;
  expect(request.status).toBe("pending");
  expect(f.local.task.status).toBe("waiting");
  const decision = { type: "allow" as const };
  f.execution.applyDecision(request.id, decision);
  await f.running;
  await f.finished();
  expect(observed).toEqual({ status: "applied", decision, savedDecision: decision });
  expect(conversation.startTurn).toHaveBeenCalledTimes(1);
  expect(conversation.stop).toHaveBeenCalledWith("complete");
  expect(f.local.task.status).toBe("succeeded");
});

it("does not resolve an approval when its applied decision cannot be committed", async () => {
  let drained!: () => void;
  const factory: SessionFactory = () => ({
    handle: {
      completed: new Promise<void>((resolve) => {
        drained = resolve;
      }),
      kill: async () => {
        drained();
      },
    },
    input: "queue",
    holdPlanOnExit: false,
    planContinuation: "turn",
    planTitle: "SDK",
    turnId: undefined,
    preview: "",
    summary: "",
    initialize: async () => "synthetic-session",
    sendTurn: async () => {},
    steer: async () => {},
    interrupt: async () => {},
  });
  const f = fixture("codex", [], { factory });
  await f.running;
  let allowed = false;
  const answer = f.execution
    .ask("permission", "Synthetic effect", "Synthetic approval")
    .then((decision) => {
      allowed = decision.type === "allow";
      return decision;
    });
  const request = [...f.requests.values()][0]!;
  vi.spyOn(f.store, "request").mockImplementationOnce(() => {
    throw new Error("Synthetic write failure");
  });
  expect(() => f.execution.applyDecision(request.id, { type: "allow" })).toThrow(
    "Synthetic write failure",
  );
  await Promise.resolve();
  expect(allowed).toBe(false);
  expect(f.requests.get(request.id)?.status).toBe("pending");
  f.execution.cancel();
  expect(await answer).toMatchObject({ type: "deny" });
  await f.finished();
});
