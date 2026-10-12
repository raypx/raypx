/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { CloudConversationSnapshotDto, CloudTaskDto } from "@raypx/contracts";
import type { ConversationSessionState } from "@raypx/client/conversations";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  submit: null as unknown as (prompt: string) => Promise<void>,
  task: null as unknown as CloudTaskDto,
  state: null as unknown as ConversationSessionState,
  identity: { actorId: "account-a", accountId: "account-a" },
  startRound: vi.fn(),
  continueRound: vi.fn(),
  sendTurn: vi.fn(),
  invalidate: vi.fn(async () => {}),
  telemetry: vi.fn(),
  refresh: vi.fn(),
  reconnect: vi.fn(),
  dispose: vi.fn(),
  resources: {
    files: { disposeAccount: vi.fn() },
    register: vi.fn(() => () => {}),
    markCreated: vi.fn(),
  },
}));

vi.mock("../../env", () => ({ env: {} }));
vi.mock("../../i18n/client", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../lib/product-telemetry", () => ({ captureProductEvent: mocks.telemetry }));
vi.mock("../../lib/cloud-queries", () => ({ invalidateRunFacts: mocks.invalidate }));
vi.mock("../../lib/use-cloud-queries", () => ({
  useCloudQueries: () => ({
    identity: mocks.identity,
    resources: mocks.resources,
    queryClient: {},
    queries: { capabilities: () => ({}), task: () => ({}) },
  }),
}));
vi.mock("../../lib/api-client", () => ({
  createWebApiClient: () => ({
    cloud: {
      tasks: { startRound: mocks.startRound, continueRound: mocks.continueRound },
      conversations: { sendTurn: mocks.sendTurn },
    },
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { task: mocks.task } }),
  useSuspenseQuery: () => ({ data: { search: true, computer: true, unavailableReason: null } }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@raypx/client/conversations", () => ({
  createConversationTransport: () => ({}),
  createConversationSession: () => ({
    getSnapshot: () => mocks.state,
    subscribe: () => () => {},
    refresh: mocks.refresh,
    reconnect: mocks.reconnect,
    dispose: mocks.dispose,
  }),
}));
vi.mock("@raypx/agent-ui/model", () => ({ createConversationProjection: () => () => [] }));
vi.mock("@raypx/agent-ui/conversation", () => ({ ConversationFeed: () => null }));
vi.mock("../runs/cloud-run-view", () => ({ CloudRunView: () => null }));
vi.mock("../files/input-attachments", () => ({ InputAttachments: () => null }));
vi.mock("../files/upload", () => ({ uploadInputFile: vi.fn() }));
vi.mock("@raypx/agent-ui/composer", () => ({
  Composer: ({
    value,
    onValueChange,
    onSubmit,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    onSubmit: (prompt: string) => Promise<void>;
  }) => {
    mocks.submit = onSubmit;
    return (
      <input
        aria-label="draft"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
    );
  },
}));

import { ConversationWorkspace } from "./conversation-workspace";

const initial = {
  conversation: { id: "conversation", title: "Conversation", scope: { type: "personal" } },
  turns: [],
  runs: [
    {
      id: "old-run",
      taskId: "task",
      roundId: "old-round",
      prompt: "Old goal",
      attempt: 1,
      status: "succeeded",
      createdAt: new Date("2026-01-01"),
    },
  ],
  historyCursor: null,
} as unknown as CloudConversationSnapshotDto;
const roundResult = { round: { id: "new-round", goalVersion: 4 } };
const turnResult = { run: { id: "new-run", taskId: "task" }, task: { id: "task" } };

function workspace() {
  return <ConversationWorkspace key={mocks.identity.accountId} initial={initial} writable />;
}

function choose(action: "newTask" | "newRound" | "continueRound") {
  fireEvent.change(screen.getByLabelText("mode"), { target: { value: "computer" } });
  fireEvent.change(screen.getByLabelText("taskAction"), { target: { value: action } });
  fireEvent.change(screen.getByLabelText("draft"), { target: { value: "New goal" } });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.invalidate.mockResolvedValue(undefined);
  mocks.resources.register.mockImplementation(() => () => {});
  mocks.identity = { actorId: "account-a", accountId: "account-a" };
  mocks.task = {
    id: "task",
    scope: { type: "personal", ownerUserId: "account-a" },
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    title: "Task",
    goal: "Old goal",
    goalVersion: 3,
    currentRoundId: "old-round",
    requestedByUserId: "account-a",
    status: "waiting_input",
    conversationId: "conversation",
    currentRevisionId: null,
    acceptedRevisionId: null,
    idempotencyKey: "task-intent",
  };
  mocks.state = {
    data: initial,
    connection: "connected",
    error: null,
    historyLoading: false,
    historyError: null,
  } as ConversationSessionState;
  window.matchMedia = vi.fn(() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

it("reuses the created Round and intent after sendTurn fails, even when task facts refresh", async () => {
  mocks.startRound.mockResolvedValue(roundResult);
  mocks.sendTurn.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(turnResult);
  const view = render(workspace());
  choose("newRound");
  await act(async () => {
    await expect(mocks.submit("New goal")).rejects.toThrow("offline");
  });
  expect(screen.getByLabelText("draft")).toHaveValue("New goal");
  expect(mocks.resources.markCreated).not.toHaveBeenCalled();
  expect(mocks.invalidate).not.toHaveBeenCalled();
  expect(mocks.telemetry).not.toHaveBeenCalled();
  mocks.task = { ...mocks.task, goalVersion: 4, currentRoundId: "new-round" };
  view.rerender(workspace());
  await act(async () => mocks.submit("New goal"));

  expect(mocks.startRound).toHaveBeenCalledOnce();
  const [roundInput, roundOptions] = mocks.startRound.mock.calls[0]!;
  expect(roundInput).toMatchObject({ taskId: "task", expectedGoalVersion: 3, goal: "New goal" });
  expect(roundOptions.signal).toBeInstanceOf(AbortSignal);
  for (const [input, options] of mocks.sendTurn.mock.calls) {
    expect(input).toMatchObject({
      conversationId: "conversation",
      roundId: "new-round",
      goalVersion: 4,
      idempotencyKey: roundInput.idempotencyKey,
    });
    expect(options.signal).toBe(roundOptions.signal);
  }
  expect(mocks.sendTurn).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText("draft")).toHaveValue("");
  expect(mocks.resources.markCreated).toHaveBeenCalledWith("account-a", "new-run");
  expect(mocks.invalidate).toHaveBeenCalledWith({}, mocks.identity, "task");
  expect(mocks.telemetry.mock.calls).toEqual([["turn_sent", { mode: "computer" }]]);
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("keeps the original expected goal version and key when startRound's response is lost", async () => {
  mocks.startRound.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(roundResult);
  mocks.sendTurn.mockResolvedValue(turnResult);
  const view = render(workspace());
  choose("newRound");
  await act(async () => {
    await expect(mocks.submit("New goal")).rejects.toThrow("offline");
  });
  mocks.task = { ...mocks.task, goalVersion: 4, currentRoundId: "new-round" };
  view.rerender(workspace());
  await act(async () => mocks.submit("New goal"));
  const [firstInput] = mocks.startRound.mock.calls[0]!;
  const [retryInput] = mocks.startRound.mock.calls[1]!;
  expect(retryInput).toEqual(firstInput);
  expect(retryInput.expectedGoalVersion).toBe(3);
  expect(mocks.sendTurn).toHaveBeenCalledOnce();
});

it.each(["newTask", "continueRound"] as const)(
  "preserves %s submission and success effects",
  async (action) => {
    mocks.sendTurn.mockResolvedValue(turnResult);
    mocks.continueRound.mockResolvedValue(turnResult);
    render(workspace());
    choose(action);
    await act(async () => mocks.submit("New goal"));
    expect(mocks.startRound).not.toHaveBeenCalled();
    if (action === "continueRound") {
      expect(mocks.sendTurn).not.toHaveBeenCalled();
      expect(mocks.continueRound).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: "task", roundId: "old-round", goalVersion: 3 }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    } else {
      expect(mocks.continueRound).not.toHaveBeenCalled();
      expect(mocks.sendTurn).toHaveBeenCalledOnce();
    }
    expect(mocks.telemetry.mock.calls).toEqual([
      ["turn_sent", { mode: "computer" }],
      ...(action === "newTask" ? [["task_created", { mode: "computer" }]] : []),
    ]);
    expect(mocks.invalidate).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("draft")).toHaveValue("");
  },
);

it.each([
  ["unmount", "startRound"],
  ["unmount", "sendTurn"],
  ["account replacement", "startRound"],
  ["account replacement", "sendTurn"],
] as const)("aborts %s and ignores a late %s response", async (exit, stage) => {
  let finish!: (result: typeof roundResult | typeof turnResult) => void;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  mocks.startRound.mockResolvedValue(roundResult);
  mocks.sendTurn.mockResolvedValue(turnResult);
  mocks[stage].mockReturnValueOnce(pending);
  const view = render(workspace());
  choose("newRound");
  let submission!: Promise<void>;
  act(() => {
    submission = mocks.submit("New goal");
  });
  await waitFor(() => expect(mocks[stage]).toHaveBeenCalledOnce());
  const [, options] = mocks[stage].mock.calls[0]!;

  if (exit === "unmount") view.unmount();
  else {
    mocks.identity = { actorId: "account-b", accountId: "account-b" };
    view.rerender(workspace());
    fireEvent.change(screen.getByLabelText("draft"), { target: { value: "Other account draft" } });
  }
  expect(options.signal.aborted).toBe(true);
  await act(async () => {
    finish(stage === "startRound" ? roundResult : turnResult);
    await submission;
  });
  if (stage === "startRound") expect(mocks.sendTurn).not.toHaveBeenCalled();
  expect(mocks.resources.markCreated).not.toHaveBeenCalled();
  expect(mocks.invalidate).not.toHaveBeenCalled();
  expect(mocks.telemetry).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.dispose).toHaveBeenCalled();
  if (exit === "account replacement")
    expect(screen.getByLabelText("draft")).toHaveValue("Other account draft");
});
