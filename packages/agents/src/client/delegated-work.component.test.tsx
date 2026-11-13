import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { agentIdSchema } from "@raypx/core/agents";
import { runIdSchema } from "@raypx/core/conversation";
import type { RunView } from "../model.js";
import { DelegatedWork, type DelegatedWorkItem } from "./delegated-work.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const run: RunView = {
  id: runIdSchema.parse("child-one"),
  agentId: agentIdSchema.parse("agent-two"),
  parentRunId: runIdSchema.parse("parent-one"),
  state: "succeeded",
  failureCode: null,
  messageId: "message-one",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const item: DelegatedWorkItem = {
  run,
  task: "Write a short report",
  activity: [
    {
      runId: run.id,
      parentRunId: runIdSchema.parse("parent-one"),
      agentId: agentIdSchema.parse("agent-two"),
      toolCallId: "write-one",
      toolName: "computer_write_file",
      target: "report.txt",
      argumentSummary: "Write report.txt",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:01.000Z",
      outcome: "succeeded",
      durationMs: 1000,
      exitStatus: null,
    },
  ],
};

function fixture(work: DelegatedWorkItem[] = [item], language: "en" | "zh" = "en") {
  return render(
    <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
      <DelegatedWork work={work} parentRunId="parent-one" agentName={() => "Research Agent"} />
    </BrowserLanguageProvider>,
  );
}

it.each(["en", "zh"] as const)(
  "keeps child tools collapsed under delegated work in %s",
  async (language) => {
    const strings = { en, zh }[language].agents;
    const view = fixture([item], language);
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(view.container.querySelector("[data-child-run-id]")).toBeNull();
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));
    const child = view.container.querySelector<HTMLElement>("[data-child-run-id='child-one']")!;
    expect(within(child).getByText(item.task)).toBeVisible();
    expect(within(child).getByText("Research Agent")).toBeVisible();
    expect(within(child).getByText(strings.delegation.states.succeeded)).toBeVisible();
    const tools = within(child).getByRole("button");
    expect(tools).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("report.txt")).not.toBeInTheDocument();
    fireEvent.click(tools);
    await waitFor(() => expect(screen.getByText("report.txt")).toBeVisible());
    expect(screen.getByText(strings.tools.writeFile)).toBeVisible();
  },
);

it.each(["queued", "running", "waiting", "succeeded", "failed", "cancelled"] as const)(
  "shows the %s child state and bounds the task summary",
  async (state) => {
    const view = fixture([{ ...item, task: "x".repeat(300), run: { ...run, state } }]);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(view.container.querySelector("[data-child-state]")).toHaveAttribute(
        "data-child-state",
        state,
      ),
    );
    expect(screen.getByText("x".repeat(240))).toBeInTheDocument();
    expect(screen.getByText(en.agents.delegation.states[state])).toBeInTheDocument();
  },
);

it("uses an explicit generic task when the contract has no task summary", async () => {
  fixture([{ ...item, task: "" }]);
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(screen.getByText(en.agents.delegation.task)).toBeVisible());
});

it("omits the group when the parent has no children", () => {
  const view = fixture([]);
  expect(view.container.querySelector("[data-delegated-work]")).toBeNull();
});

it.each(["Research Agent with a long name ".repeat(8), "负责研究和编写报告的智能体".repeat(12)])(
  "keeps long Agent names in a shrinking wrapping row",
  async (name) => {
    const view = render(
      <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
        <DelegatedWork work={[item]} parentRunId="parent-one" agentName={() => name} />
      </BrowserLanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(view.container.querySelector("[data-child-run-id]")).not.toBeNull());
    const label = screen.getByText(name.trim());
    expect(label).toHaveClass("min-w-0", "wrap-anywhere");
    expect(label.closest("[data-child-run-id]")).toHaveClass("min-w-0");
  },
);
