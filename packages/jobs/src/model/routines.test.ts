import { describe, expect, it } from "vitest";
import type { Routine, RoutineHistory } from "@raypx/core/routines";
import {
  createRoutineForm,
  routineFormInput,
  routineOccurrences,
  routineHistoryState,
  routineLastOutcome,
  routineDelayMinutes,
  clearRoutineSecrets,
  revealedRoutineSecrets,
  routineErrorKey,
} from "./routines.js";

const agentId = "11111111-1111-4111-8111-111111111111";
describe("routine form", () => {
  it("defaults to the browser zone and validates only selected trigger fields", () => {
    const form = {
      ...createRoutineForm(null, "Asia/Shanghai"),
      name: "Daily",
      prompt: "Check the queue",
    };
    expect(routineFormInput(form, agentId)?.triggers).toEqual({
      schedule: { cron: "0 9 * * 1-5", timezone: "Asia/Shanghai" },
    });
    form.selected = { schedule: false, webhook: true, email: false, repository: false };
    form.cron = "invalid";
    expect(routineFormInput(form, agentId)?.triggers).toEqual({ webhook: true });
    form.selected.email = true;
    expect(routineFormInput(form, agentId)).toBeNull();
    form.allowedSender = "Member@Example.com";
    expect(routineFormInput(form, agentId)?.triggers.email).toEqual({
      allowedSender: "member@example.com",
    });
    form.selected.repository = true;
    form.repositoryEvents = "push, pull_request";
    expect(routineFormInput(form, agentId)?.triggers.repository).toEqual({
      events: ["push", "pull_request"],
    });
    form.repositoryEvents = "push, push";
    expect(routineFormInput(form, agentId)).toBeNull();
  });
  it("rejects no trigger and an invalid Cron expression", () => {
    const form = { ...createRoutineForm(null, "UTC"), name: "Daily", prompt: "Check" };
    form.cron = "* * * * * *";
    expect(routineFormInput(form, agentId)).toBeNull();
    form.selected.schedule = false;
    expect(routineFormInput(form, agentId)).toBeNull();
  });
});

it("calculates three occurrences with a fixed clock and the daylight saving transition", () => {
  expect(
    routineOccurrences("0 9 * * *", "Asia/Shanghai", new Date("2026-03-07T00:00:00Z")),
  ).toEqual(["2026-03-07T01:00:00.000Z", "2026-03-08T01:00:00.000Z", "2026-03-09T01:00:00.000Z"]);
  expect(
    routineOccurrences("0 9 * * *", "America/New_York", new Date("2026-03-07T00:00:00Z")),
  ).toEqual(["2026-03-07T14:00:00.000Z", "2026-03-08T13:00:00.000Z", "2026-03-09T13:00:00.000Z"]);
  expect(routineOccurrences("bad", "UTC", new Date())).toEqual([]);
});

it("maps occurrence states and actual start delays independently", () => {
  const history: RoutineHistory = {
    id: "occurrence",
    routineId: agentId,
    kind: "schedule",
    dueAt: "2026-11-14T00:00:00Z",
    createdAt: "2026-11-14T00:00:00Z",
    runId: "run",
    conversationId: "conversation",
    status: "fired",
    startedAt: null,
    delayMs: null,
    runState: "queued",
  };
  expect(routineHistoryState(history)).toBe("queued");
  expect(routineDelayMinutes(history)).toBeNull();
  expect(routineHistoryState({ ...history, startedAt: "2026-11-14T00:40:00Z" })).toBe("started");
  expect(
    routineDelayMinutes({ ...history, startedAt: "2026-11-14T00:40:00Z", delayMs: 2_400_000 }),
  ).toBe(40);
  expect(routineHistoryState({ ...history, status: "coalesced" })).toBe("joined");
  expect(routineHistoryState({ ...history, status: "ignored" })).toBe("filtered");
  for (const [runState, outcome] of Object.entries({
    succeeded: "completed",
    failed: "failed",
    cancelled: "cancelled",
    running: "running",
    waiting: "waiting",
    queued: "queued",
  })) {
    expect(routineLastOutcome({ ...history, runState })).toBe(outcome);
    expect(routineLastOutcome({ ...history, status: "coalesced", runState })).toBe(outcome);
  }
  expect(routineLastOutcome({ ...history, runState: "unknown-new-state" })).toBe("queued");
  expect(
    routineLastOutcome({ ...history, runState: null, startedAt: "2026-11-14T00:40:00Z" }),
  ).toBe("started");
  expect(routineLastOutcome({ ...history, status: "ignored", runState: "succeeded" })).toBe(
    "filtered",
  );
});

it("clears both one-time secrets on close", () => {
  let secrets = revealedRoutineSecrets({
    webhookKey: "one-time-key",
    repositorySecret: "one-time-secret",
  });
  expect(secrets.webhookKey).toBe("one-time-key");
  secrets = clearRoutineSecrets();
  expect(secrets).toEqual({ webhookKey: null, repositorySecret: null });
});

it("maps transport and ingress error codes without exposing arbitrary text", () => {
  expect(routineErrorKey({ code: "CONFLICT", message: "BODY_MISMATCH" })).toBe("bodyMismatch");
  expect(routineErrorKey({ code: "BAD_REQUEST", message: "PAYLOAD_TOO_LARGE" })).toBe(
    "payloadTooLarge",
  );
  expect(routineErrorKey({ code: "TOO_MANY_REQUESTS", message: "Too many requests" })).toBe(
    "rateLimited",
  );
  expect(routineErrorKey({ code: "NOT_FOUND", message: "Not found" })).toBe("notFound");
  expect(routineErrorKey(new Error("private payload"))).toBe("requestFailed");
});

it("uses only server ingress addresses and preserves each unavailable reason", async () => {
  const { routineIngressAddress } = await import("./routines.js");
  const routine: Pick<Routine, "ingress"> = {
    ingress: {
      webhook: { url: "https://public.example/webhook", unavailableReason: null },
      repository: { url: null, unavailableReason: "PUBLIC_API_ORIGIN_NOT_CONFIGURED" },
      email: { address: "incoming@example.test", unavailableReason: null },
    },
  };
  expect(routineIngressAddress(routine, "webhook")).toEqual({
    value: "https://public.example/webhook",
    unavailableReason: null,
  });
  expect(routineIngressAddress(routine, "email").value).toBe("incoming@example.test");
  expect(routineIngressAddress(routine, "repository")).toEqual({
    value: null,
    unavailableReason: "PUBLIC_API_ORIGIN_NOT_CONFIGURED",
  });
  expect(routineIngressAddress({}, "webhook").unavailableReason).toBe("ADDRESS_UNAVAILABLE");
  expect(
    routineIngressAddress(
      {
        ...routine,
        ingress: {
          ...routine.ingress!,
          email: { address: null, unavailableReason: "EMAIL_NOT_CONFIGURED" },
        },
      },
      "email",
    ).unavailableReason,
  ).toBe("EMAIL_NOT_CONFIGURED");
  expect(
    routineIngressAddress(
      {
        ...routine,
        ingress: {
          ...routine.ingress!,
          webhook: { url: null, unavailableReason: "TRIGGER_NOT_CONFIGURED" },
        },
      },
      "webhook",
    ).unavailableReason,
  ).toBe("TRIGGER_NOT_CONFIGURED");
});
