import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { runIdSchema, type ToolActivity as ToolCallActivity } from "@raypx/core/conversation";
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
