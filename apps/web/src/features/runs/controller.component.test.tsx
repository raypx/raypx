/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { CloudRunSessionState } from "@voidmix/client/cloud-runs";
import type { ApiClient } from "@voidmix/client";

const mocks = vi.hoisted(() => ({
  state: null as unknown as CloudRunSessionState,
  listeners: new Set<() => void>(),
  created: false,
  refresh: vi.fn(),
  reconnect: vi.fn(),
  dispose: vi.fn(),
  invalidate: vi.fn(async () => {}),
  resources: {
    files: { disposeAccount: vi.fn() },
    register: vi.fn(() => () => {}),
    wasCreated: () => mocks.created,
    forgetCreated: vi.fn(),
    markCreated: vi.fn(),
  },
}));
vi.mock("../../env", () => ({ env: {} }));
vi.mock("../../lib/product-telemetry", () => ({ captureProductEvent: vi.fn() }));
vi.mock("../../lib/use-cloud-queries", () => ({
  useCloudQueries: () => ({
    identity: { actorId: "account", accountId: "account" },
    resources: mocks.resources,
    queryClient: {},
  }),
}));
vi.mock("../../lib/cloud-queries", () => ({ invalidateRunFacts: mocks.invalidate }));
vi.mock("@voidmix/client/cloud-runs", () => ({
  createCloudRunTransport: () => ({}),
  createCloudRunSession: () => ({
    getSnapshot: () => mocks.state,
    subscribe: (listener: () => void) => {
      mocks.listeners.add(listener);
      return () => mocks.listeners.delete(listener);
    },
    refresh: mocks.refresh,
    reconnect: mocks.reconnect,
    dispose: mocks.dispose,
    loadHistory: async () => {},
  }),
}));
import { useCloudRunController } from "./use-cloud-run-controller";
function state(status: "running" | "succeeded", settled = true): CloudRunSessionState {
  return {
    data: {
      run: { id: "run", status, taskId: "task" },
      events: [],
      executions: [],
      sources: [],
      artifacts: [],
      commands: [],
      messages: [],
      cursor: 1,
      historyCursor: null,
    } as unknown as NonNullable<CloudRunSessionState["data"]>,
    connection: "connected",
    error: null,
    refreshing: false,
    settled,
    historyLoading: false,
    historyError: null,
  };
}
function publish(next: CloudRunSessionState) {
  act(() => {
    mocks.state = next;
    for (const notify of mocks.listeners) notify();
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.listeners.clear();
  mocks.created = false;
  mocks.state = state("succeeded");
});
afterEach(cleanup);
it("opening an old terminal Run does not notify or invalidate ordinary resources", () => {
  const onFinished = vi.fn();
  renderHook(() => useCloudRunController({ api: {} as ApiClient, runId: "run", onFinished }));
  expect(onFinished).not.toHaveBeenCalled();
  expect(mocks.invalidate).not.toHaveBeenCalled();
});
it("handles a locally-created Run that finished before the first snapshot exactly once", async () => {
  mocks.created = true;
  const onFinished = vi.fn();
  renderHook(() => useCloudRunController({ api: {} as ApiClient, runId: "run", onFinished }));
  await waitFor(() => expect(onFinished).toHaveBeenCalledOnce());
  publish(state("succeeded"));
  expect(onFinished).toHaveBeenCalledOnce();
  expect(mocks.invalidate).toHaveBeenCalledOnce();
});
it("waits for final durable facts after a followed Run changes to a terminal status", async () => {
  mocks.state = state("running", false);
  const onFinished = vi.fn();
  renderHook(() => useCloudRunController({ api: {} as ApiClient, runId: "run", onFinished }));
  publish(state("succeeded", false));
  expect(onFinished).not.toHaveBeenCalled();
  publish(state("succeeded", true));
  await waitFor(() => expect(onFinished).toHaveBeenCalledOnce());
  expect(mocks.invalidate).toHaveBeenCalledOnce();
});
