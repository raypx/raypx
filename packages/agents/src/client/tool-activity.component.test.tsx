import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { approvalRequestIdSchema } from "@raypx/core/approvals";
import { runIdSchema } from "@raypx/core/conversation";
import type { ApprovalCardView } from "../model.js";
import { ComputerActivity, ToolActivity } from "./tool-activity.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
const card: ApprovalCardView = {
  requestId: approvalRequestIdSchema.parse("request-one"),
  runId: runIdSchema.parse("run-one"),
  toolName: "computer_write_file",
  target: "notes/report.txt",
  argumentSummary: "bounded argument summary",
  memberAccountId: "account",
  expiresAt: "2100-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  sequence: 3,
  state: "approved",
  answeredByAccountId: "account",
  answering: false,
  error: null,
};

it.each(["en", "zh"] as const)(
  "starts collapsed and expands bounded tool names, targets and request outcomes in %s",
  (language) => {
    const strings = { en, zh }[language].agents;
    const privateCard = {
      ...card,
      arguments: { content: "PRIVATE FILE BODY" },
      output: "PRIVATE OUTPUT",
    };
    render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <ToolActivity accountId="account" cards={[privateCard]} runId={card.runId} />
      </BrowserLanguageProvider>,
    );
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: strings.activity.title })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list", { name: strings.activity.title });
    expect(within(list).getByText(strings.tools.writeFile)).toBeVisible();
    expect(within(list).getByText("notes/report.txt")).toBeVisible();
    expect(within(list).getByText(strings.approval.states.approved)).toBeVisible();
    expect(
      within(list).getByText(language === "en" ? "Answered by You" : "由你处理"),
    ).toBeVisible();
    expect(screen.queryByText("bounded argument summary")).not.toBeInTheDocument();
    expect(screen.queryByText("PRIVATE FILE BODY")).not.toBeInTheDocument();
    expect(screen.queryByText("PRIVATE OUTPUT")).not.toBeInTheDocument();
  },
);

it("keeps each request as a separate row and limits computer activity to twenty recent requests", () => {
  const cards = Array.from({ length: 24 }, (_, index) => ({
    ...card,
    requestId: approvalRequestIdSchema.parse(`request-${index}`),
    target: `report-${index}.txt`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  }));
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <ComputerActivity cards={cards} />
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
      <ToolActivity accountId="account" cards={[]} runId={card.runId} />
    </BrowserLanguageProvider>,
  );
  expect(view.container.querySelector("[data-tool-activity]")).toBeNull();
});

it.each(["approved", "denied", "expired", "cancelled"] as const)(
  "keeps %s as a compact request row",
  (state) => {
    render(
      <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
        <ToolActivity
          accountId="account"
          cards={[{ ...card, state, answeredByAccountId: "Alex" }]}
          runId={card.runId}
        />
      </BrowserLanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "1 tool request" }));
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent(en.agents.approval.states[state]);
    expect(row).toHaveTextContent("Answered by Alex");
    expect(row).toHaveAttribute("data-message-row", `approval:${card.requestId}`);
    expect(row.querySelector("[data-approval-card]")).toBeNull();
  },
);
