import { describe, expect, it } from "vite-plus/test";
import type { AgentEvent, HumanRequest, TaskActivity } from "@raypx/core/tasks";
import { runSteps } from "./run-steps.ts";

const taskId = "0f8b2c64-2f4e-4d0a-8b8f-6c7d5e4f3a2b";
let next = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;

function status(value: Extract<AgentEvent, { kind: "status" }>["status"]): AgentEvent {
  return { id: uuid(), taskId, kind: "status", status: value, summary: "" };
}

function tool(
  id: string,
  state: Extract<TaskActivity, { kind: "tool" }>["status"],
  durationMs = 1000,
): AgentEvent {
  return {
    id: uuid(),
    taskId,
    kind: "activity",
    entry: {
      id,
      taskId,
      order: 1,
      revision: 1,
      createdAt: "2026-11-10T08:00:00.000Z",
      updatedAt: new Date(Date.parse("2026-11-10T08:00:00.000Z") + durationMs).toISOString(),
      kind: "tool",
      name: "Edit",
      status: state,
    },
  };
}

function request(id: string, state: HumanRequest["status"]): HumanRequest {
  return {
    id,
    taskId,
    kind: "permission",
    title: "Run migration",
    body: "",
    questions: [],
    expiresAt: "2026-11-10T09:00:00.000Z",
    status: state,
    decision: null,
  };
}

const page = (events: AgentEvent[]) => events.map((event, index) => ({ cursor: index + 1, event }));

describe("run steps", () => {
  it("collapses repeated statuses and skips conversation-only events", () => {
    const message: AgentEvent = {
      id: uuid(),
      taskId,
      kind: "activity_delta",
      entryId: uuid(),
      baseRevision: 1,
      revision: 2,
      append: "text",
      updatedAt: "2026-11-10T08:00:00.000Z",
      truncated: false,
    };
    const steps = runSteps(
      page([status("running"), status("running"), message, status("succeeded")]),
      [],
    );
    expect(steps.map((step) => (step.kind === "status" ? step.status : step.kind))).toEqual([
      "running",
      "succeeded",
    ]);
  });

  it("summarizes consecutive tool calls once per call with their total duration", () => {
    const first = uuid();
    const second = uuid();
    const steps = runSteps(
      page([
        status("running"),
        tool(first, "running"),
        tool(first, "succeeded", 2000),
        tool(second, "failed", 500),
        status("waiting"),
      ]),
      [],
    );
    expect(steps[1]).toMatchObject({
      kind: "tools",
      count: 2,
      running: 0,
      failed: 1,
      seconds: 2.5,
    });
    expect(steps).toHaveLength(3);
  });

  it("shows each request once at its current status", () => {
    const id = uuid();
    const pending = request(id, "pending");
    const steps = runSteps(
      page([
        { id: uuid(), taskId, kind: "request", request: pending },
        { id: uuid(), taskId, kind: "request", request: pending },
      ]),
      [request(id, "applied")],
    );
    expect(steps).toEqual([
      {
        kind: "request",
        key: `request:${id}`,
        title: "Run migration",
        requestKind: "permission",
        status: "applied",
      },
    ]);
  });
});
