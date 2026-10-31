import { profileStorage } from "../../../helpers/sqlite";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RequestBroker,
  type BrokerStore,
  type DecisionReceipt,
} from "../../../../src/runtime/terminal/broker";
import { TerminalStore } from "../../../../src/runtime/terminal/store";
import type { TerminalRequest } from "@raypx/contracts/terminal";

const input = () => ({
  sessionId: crypto.randomUUID(),
  provider: "codex" as const,
  kind: "permission" as const,
  title: "Bash",
  body: '{"command":"printf test"}',
  questions: [],
});
function memory(): BrokerStore {
  const requests = new Map<string, TerminalRequest>(),
    receipts = new Map<string, DecisionReceipt>();
  return {
    requests: () => structuredClone([...requests.values()]),
    receipt: (id) => structuredClone(receipts.get(id)),
    remove: (id) => {
      requests.delete(id);
    },
    save: (request, receipt) => {
      requests.set(request.id, structuredClone(request));
      if (receipt) receipts.set(receipt.input.receiptId, structuredClone(receipt));
    },
  };
}
const brokers: RequestBroker[] = [];
const broker = (store: BrokerStore = memory(), changed?: (request: TerminalRequest) => void) => {
  const b = new RequestBroker(store, changed);
  brokers.push(b);
  return b;
};
const decision = (request: TerminalRequest) => ({
  id: request.id,
  epoch: request.epoch,
  revision: request.revision,
  receiptId: crypto.randomUUID(),
  decision: { type: "allow" as const },
});
afterEach(() => {
  for (const b of brokers.splice(0)) b.close();
  vi.useRealTimers();
});
it("evicts finished history and its receipts after 256 entries while keeping new requests usable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raypx-terminal-bounds-")),
    store = new TerminalStore(profileStorage(directory).database),
    b = broker(store);
  const projectId = store.projectId("/private/synthetic-project");
  const receipts: string[] = [];
  try {
    for (let index = 0; index < 300; index++) {
      const opened = b.open(input(), { away: true, reachable: true }),
        answer = decision(opened.request!);
      receipts.push(answer.receiptId);
      b.decide(answer);
      b.delivered(opened.request!.id, opened.request!.epoch);
      await opened.outcome;
    }
    expect(b.list(256)).toHaveLength(256);
    expect(store.receipt(receipts[0]!)).toBeUndefined();
    expect(store.receipt(receipts.at(-1)!)).toBeDefined();
    expect(projectId).toMatch(/^[a-f0-9-]{36}$/);
    expect(store.projectId("/private/synthetic-project")).toBe(projectId);
    b.close();
    const restored = new TerminalStore(profileStorage(directory).database);
    expect(restored.projectId("/private/synthetic-project")).toBe(projectId);
  } finally {
    b.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it("persists before dispatch, fences duplicate answers and never assumes applied", async () => {
  const b = broker(),
    { request, outcome } = b.open(input(), { away: true, reachable: true });
  const answer = decision(request!);
  expect(b.decide(answer).status).toBe("decided");
  expect(b.decide(answer).status).toBe("decided");
  expect(() => b.decide({ ...answer, receiptId: crypto.randomUUID() })).toThrow(/pending/);
  expect(() => b.decide({ ...answer, decision: { type: "deny", note: "different" } })).toThrow(
    /Receipt/,
  );
  expect(await outcome).toEqual({ type: "decision", decision: { type: "allow" } });
  expect(b.delivered(request!.id, request!.epoch)).toBe(true);
  expect(b.get(request!.id)?.status).toBe("delivered");
});

it("does not deduplicate two invocations with identical tool input", () => {
  const b = broker(),
    value = input();
  const one = b.open(value, { away: true, reachable: true }).request!;
  const two = b.open(value, { away: true, reachable: true }).request!;
  expect(one.id).not.toBe(two.id);
  expect(one.invocationId).not.toBe(two.invocationId);
});

it("expires after five minutes, does not grant permission and rejects a late answer", async () => {
  vi.useFakeTimers();
  const b = broker(),
    { request, outcome } = b.open(input(), { away: true, reachable: true });
  vi.advanceTimersByTime(299_999);
  expect(b.get(request!.id)?.status).toBe("pending");
  vi.advanceTimersByTime(1);
  expect(await outcome).toEqual({ type: "fallback", reason: "expired" });
  expect(b.get(request!.id)?.status).toBe("expired");
  expect(() => b.decide(decision(request!))).toThrow(/pending/);
});

it("falls back without creating a request when Away is off or no channel is connected", async () => {
  const b = broker();
  expect(await b.open(input(), { away: false, reachable: true }).outcome).toEqual({
    type: "fallback",
    reason: "away_off",
  });
  expect(await b.open(input(), { away: true, reachable: false }).outcome).toEqual({
    type: "fallback",
    reason: "unavailable",
  });
  expect(b.list()).toEqual([]);
});

it("withdraws requests on hook disconnect and rejects stale epochs and revisions", async () => {
  const b = broker(),
    controller = new AbortController();
  const { request, outcome } = b.open(input(), {
    away: true,
    reachable: true,
    signal: controller.signal,
  });
  expect(() => b.decide({ ...decision(request!), epoch: crypto.randomUUID() })).toThrow(/pending/);
  expect(() => b.decide({ ...decision(request!), revision: 2 })).toThrow(/pending/);
  controller.abort();
  expect(await outcome).toEqual({ type: "fallback", reason: "disconnected" });
  expect(b.get(request!.id)?.status).toBe("cancelled");
});

it("does not release a decision that failed to commit, and survives observer reentrancy", async () => {
  const store = memory(),
    save = store.save.bind(store);
  let fail = false;
  store.save = (request, receipt) => {
    if (fail) throw new Error("test write failed");
    save(request, receipt);
  };
  const b = broker(store, (request) => {
    if (request.status === "decided") b.cancel(request.id, "stopped");
  });
  const { request, outcome } = b.open(input(), { away: true, reachable: true });
  fail = true;
  expect(() => b.decide(decision(request!))).toThrow(/write failed/);
  expect(b.get(request!.id)?.status).toBe("pending");
  fail = false;
  b.decide(decision(request!));
  expect((await outcome).type).toBe("decision");
  expect(b.get(request!.id)?.status).toBe("decided");
});

it("falls back on disconnect even if cancellation cannot be persisted", async () => {
  const store = memory(),
    b = broker(store),
    controller = new AbortController();
  const { request, outcome } = b.open(input(), {
    away: true,
    reachable: true,
    signal: controller.signal,
  });
  store.save = () => {
    throw new Error("disk unavailable");
  };
  expect(() => controller.abort()).not.toThrow();
  expect(await outcome).toEqual({ type: "fallback", reason: "disconnected" });
  expect(b.get(request!.id)?.status).toBe("cancelled");
});

it("persists receipts across restart and marks uncertain delivery honestly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "raypx-terminal-store-"));
  let store = new TerminalStore(profileStorage(dir).database);
  const first = broker(store),
    { request, outcome } = first.open(input(), { away: true, reachable: true });
  const answer = decision(request!);
  first.decide(answer);
  await outcome;
  first.close();
  brokers.splice(brokers.indexOf(first), 1);
  store = new TerminalStore(profileStorage(dir).database);
  const second = broker(store);
  try {
    expect(second.get(request!.id)?.status).toBe("outcome_unknown");
    expect(second.decide(answer).status).toBe("outcome_unknown");
    expect(second.delivered(request!.id, request!.epoch)).toBe(false);
  } finally {
    second.close();
    brokers.splice(brokers.indexOf(second), 1);
    await rm(dir, { recursive: true, force: true });
  }
});

it("releases every hook and closes in-memory pending state even when storage fails during shutdown", async () => {
  const store = memory(),
    b = broker(store);
  const first = b.open(input(), { away: true, reachable: true });
  const second = b.open(input(), { away: true, reachable: true });
  store.save = () => {
    throw new Error("disk unavailable");
  };
  expect(() => b.withdraw("away_off")).toThrow(/persist/);
  expect(await first.outcome).toEqual({ type: "fallback", reason: "away_off" });
  expect(await second.outcome).toEqual({ type: "fallback", reason: "away_off" });
  expect(b.list().every((request) => request.status === "cancelled")).toBe(true);
});
