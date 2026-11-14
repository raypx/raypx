import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { runIdSchema, type ToolActivity as ToolCallActivity } from "@raypx/core/conversation";
import { approvalRequestIdSchema, openApiToolNameSchema } from "@raypx/core/approvals";
import { pageIdSchema } from "@raypx/core/pages";
import type { ApprovalCardView } from "../model.js";
import { ComputerActivity, ToolActivity } from "./tool-activity.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const call: ToolCallActivity = {
  runId: runIdSchema.parse("run-one"),
  toolCallId: "call-one",
  toolName: "computer_write_file",
  target: "notes/report.txt",
  argumentSummary: "bounded argument summary",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:00:01.000Z",
  outcome: "succeeded",
  durationMs: 1_000,
  exitStatus: null,
};

it.each(["en", "zh"] as const)("starts collapsed and shows real outcomes in %s", (language) => {
  const strings = { en, zh }[language].agents;
  const privateCall = {
    ...call,
    arguments: { content: "PRIVATE FILE BODY" },
    output: "PRIVATE OUTPUT",
  };
  render(
    <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
      <ToolActivity activity={[privateCall]} runId={call.runId} />
    </BrowserLanguageProvider>,
  );
  const trigger = screen.getByRole("button");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("list", { name: strings.activity.title })).not.toBeInTheDocument();
  fireEvent.click(trigger);
  const list = screen.getByRole("list", { name: strings.activity.title });
  expect(within(list).getByText(strings.tools.writeFile)).toBeVisible();
  expect(within(list).getByText("notes/report.txt")).toBeVisible();
  expect(within(list).getByText(strings.activity.outcomes.succeeded)).toBeVisible();
  expect(screen.queryByText("bounded argument summary")).not.toBeInTheDocument();
  expect(screen.queryByText("PRIVATE FILE BODY")).not.toBeInTheDocument();
  expect(screen.queryByText("PRIVATE OUTPUT")).not.toBeInTheDocument();
});

it("limits the computer list to twenty recent calls, including reads", () => {
  const activity = Array.from({ length: 24 }, (_, index) => ({
    ...call,
    toolCallId: `call-${index}`,
    toolName: "computer_read_file",
    target: `report-${index}.txt`,
    startedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  }));
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <ComputerActivity activity={activity} />
    </BrowserLanguageProvider>,
  );
  expect(screen.getAllByRole("listitem")).toHaveLength(20);
  expect(
    within(screen.getAllByRole("listitem")[0]!).getByText("report-23.txt"),
  ).toBeInTheDocument();
  expect(screen.queryByText("report-3.txt")).not.toBeInTheDocument();
});

it("omits an empty reply activity group", () => {
  const view = render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <ToolActivity activity={[]} runId={call.runId} />
    </BrowserLanguageProvider>,
  );
  expect(view.container.querySelector("[data-tool-activity]")).toBeNull();
});

it.each(["succeeded", "failed", "refused", "cancelled", "unknown", null] as const)(
  "renders the %s lifecycle state with duration and command failure status",
  (outcome) => {
    render(
      <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
        <ToolActivity
          activity={[{ ...call, toolName: "computer_run_command", outcome, exitStatus: 7 }]}
          runId={call.runId}
        />
      </BrowserLanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent(en.agents.activity.outcomes[outcome ?? "running"]);
    expect(row).toHaveTextContent("1.0 s");
    expect(within(row).queryByText("Exit status 7") !== null).toBe(outcome === "failed");
    expect(row).toHaveAttribute("data-tool-call", call.toolCallId);
  },
);

it("surfaces waiting and failure on the collapsed summary", () => {
  const view = render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <ToolActivity activity={[{ ...call, outcome: "failed" }]} runId={call.runId} />
    </BrowserLanguageProvider>,
  );
  expect(screen.getByRole("button")).toHaveTextContent("1 failed");
  view.rerender(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <ToolActivity activity={[]} pendingCount={1} runId={call.runId} />
    </BrowserLanguageProvider>,
  );
  expect(screen.getByRole("button")).toHaveTextContent("Waiting for approval");
});

it.each(["en", "zh"] as const)("names memory tools plainly in activity in %s", (language) => {
  const strings = { en, zh }[language].agents;
  render(
    <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
      <ToolActivity
        runId={call.runId}
        activity={[
          { ...call, toolName: "agent_memory_save" },
          { ...call, toolCallId: "call-update", toolName: "agent_memory_update" },
        ]}
      />
    </BrowserLanguageProvider>,
  );
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByText(strings.tools.saveMemory)).toBeVisible();
  expect(screen.getByText(strings.tools.updateMemory)).toBeVisible();
  expect(screen.queryByText("agent_memory_save")).toBeNull();
});

it.each(["en", "zh"] as const)(
  "shows an exposed Agent refusal code as a quiet inline state in %s",
  async (language) => {
    const strings = { en, zh }[language].agents;
    render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <ToolActivity
          runId={call.runId}
          activity={[
            {
              ...call,
              toolName: "agent_delegate",
              outcome: "refused",
              argumentSummary: "DELEGATION_CONCURRENT_LIMIT",
            },
          ]}
        />
      </BrowserLanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(strings.DELEGATION_CONCURRENT_LIMIT)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  },
);

it.each(["en", "zh"] as const)("names Agent interaction tools plainly in %s", (language) => {
  const strings = { en, zh }[language].agents;
  render(
    <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
      <ToolActivity
        runId={call.runId}
        activity={[
          { ...call, toolCallId: "message", toolName: "agent_send_message" },
          { ...call, toolCallId: "delegate", toolName: "agent_delegate" },
          { ...call, toolCallId: "wait", toolName: "agent_wait" },
        ]}
      />
    </BrowserLanguageProvider>,
  );
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByText(strings.tools.messageAgent)).toBeVisible();
  expect(screen.getByText(strings.tools.delegateTask)).toBeVisible();
  expect(screen.getByText(strings.tools.waitForChildren)).toBeVisible();
  expect(screen.queryByText("agent_send_message")).toBeNull();
  expect(screen.queryByText("agent_delegate")).toBeNull();
  expect(screen.queryByText("agent_wait")).toBeNull();
});

it.each(["page-one", "Space page", "unknown-page-target"])(
  "opens the Pages list without guessing a Page ID from target %s",
  async (target) => {
    const open = vi.fn();
    render(
      <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
        <ToolActivity
          activity={[{ ...call, toolName: "agent_page_update", target }]}
          runId={call.runId}
          onOpenPage={open}
        />
      </BrowserLanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    const page = await screen.findByRole("button", { name: en.agents.tools.updatePage });
    fireEvent.click(page);
    expect(open).toHaveBeenCalledWith("");
  },
);

it.each(["agent_page_create", "agent_page_update"])(
  "opens the server-produced Page for %s instead of its display target",
  (toolName) => {
    const open = vi.fn();
    render(
      <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
        <ToolActivity
          activity={[
            {
              ...call,
              toolName,
              target: "unrelated-title",
              page: { id: pageIdSchema.parse("exact-page"), version: 2 },
            },
          ]}
          runId={call.runId}
          onOpenPage={open}
        />
      </BrowserLanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(within(screen.getByRole("listitem")).getByRole("button"));
    expect(open).toHaveBeenCalledExactlyOnceWith("exact-page");
  },
);

it.each(["en", "zh"] as const)(
  "shows readable HTTP activity and read classification in %s",
  (language) => {
    render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <ToolActivity
          activity={[
            {
              ...call,
              toolName: openApiToolNameSchema.parse(
                "openapi_0123456789abcdef0123456789abcdef__getItem",
              ),
              target: "GET https://api.example.test/items/1",
              argumentSummary: "GET Read inventory item",
            },
          ]}
          runId={call.runId}
        />
      </BrowserLanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Read inventory item")).toBeVisible();
    expect(screen.getByText({ en, zh }[language].agents.openapi.readOnly)).toBeVisible();
  },
);

it.each(["en", "zh"] as const)(
  "distinguishes automatic review outcomes and member answers in %s",
  (language) => {
    const strings = { en, zh }[language].agents;
    const answer: ApprovalCardView = {
      requestId: approvalRequestIdSchema.parse("request"),
      runId: call.runId,
      toolCallId: call.toolCallId,
      toolName: "computer_write_file",
      target: call.target,
      argumentSummary: call.argumentSummary,
      memberAccountId: "member",
      expiresAt: call.startedAt,
      createdAt: call.startedAt,
      sequence: 1,
      state: "approved",
      answeredByAccountId: null,
      answering: false,
      error: null,
      review: {
        modelId: "review-model",
        verdict: "approve",
        reason: "Matches the requested note. <b>safe text</b>",
        startedAt: call.startedAt,
        completedAt: call.startedAt,
        durationMs: 1,
        fence: 2,
      },
    };
    const tree = (value: ApprovalCardView) => (
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <ToolActivity
          activity={[call]}
          runId={call.runId}
          answers={[value]}
          memberName={() => "Ari"}
        />
      </BrowserLanguageProvider>
    );
    const view = render(tree(answer));
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(strings.approval.automatic.approved)).toBeVisible();
    expect(screen.getByText(answer.review!.reason)).toBeVisible();
    expect(view.container.querySelector("[data-auto-review='approved'] b")).toBeNull();
    view.rerender(
      tree({ ...answer, state: "denied", review: { ...answer.review!, verdict: "deny" } }),
    );
    expect(screen.getByText(strings.approval.automatic.denied)).toBeVisible();
    view.rerender(
      tree({
        ...answer,
        answeredByAccountId: "member",
        review: { ...answer.review!, verdict: "ask" },
      }),
    );
    expect(screen.queryByText(strings.approval.automatic.approved)).not.toBeInTheDocument();
    expect(
      screen.getByText(strings.spaceSettings.approvedBy.replace("{name}", "Ari")),
    ).toBeVisible();
  },
);

it("replaces retained automatic attribution with the replacement request and member answer", () => {
  const old: ApprovalCardView = {
    requestId: approvalRequestIdSchema.parse("old-auto"),
    runId: call.runId,
    toolCallId: call.toolCallId,
    toolName: "computer_write_file",
    target: call.target,
    argumentSummary: call.argumentSummary,
    memberAccountId: "member",
    expiresAt: call.startedAt,
    createdAt: call.startedAt,
    sequence: 10,
    state: "approved",
    answeredByAccountId: null,
    answering: false,
    error: null,
    review: {
      modelId: "review",
      verdict: "approve",
      reason: "Matches the request.",
      startedAt: call.startedAt,
      completedAt: call.startedAt,
      durationMs: 0,
      fence: 1,
    },
  };
  const replacement: ApprovalCardView = {
    ...old,
    requestId: approvalRequestIdSchema.parse("new-member"),
    sequence: 1,
    state: "pending",
    review: {
      ...old.review!,
      verdict: "ask",
      reason: "Changed instructions require a member decision.",
    },
  };
  const tree = (answers: ApprovalCardView[]) => (
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <ToolActivity
        activity={[call]}
        runId={call.runId}
        answers={answers}
        memberName={() => "Ari"}
      />
    </BrowserLanguageProvider>
  );
  const view = render(tree([old]));
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByText("Approved automatically")).toBeVisible();
  view.rerender(tree([old, replacement]));
  expect(screen.queryByText("Approved automatically")).not.toBeInTheDocument();
  expect(view.container.querySelector("[data-auto-review]")).toBeNull();
  view.rerender(tree([old, { ...replacement, state: "approved", answeredByAccountId: "member" }]));
  expect(screen.queryByText("Approved automatically")).not.toBeInTheDocument();
  expect(screen.getByText("Approved by Ari")).toBeVisible();
});
