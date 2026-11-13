import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { approvalRequestIdSchema } from "@raypx/core/approvals";
import { runIdSchema } from "@raypx/core/conversation";
import type { ApprovalCardView } from "../model.js";
import { ApprovalCard } from "./approval-card.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });

function pendingCard(overrides: Partial<ApprovalCardView> = {}): ApprovalCardView {
  return {
    requestId: approvalRequestIdSchema.parse("request-one"),
    runId: runIdSchema.parse("run-one"),
    toolName: "computer_write_file",
    target: "notes/report.txt",
    argumentSummary: "Write a small text file",
    memberAccountId: "account",
    expiresAt: "2100-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    sequence: 3,
    state: "pending",
    answeredByAccountId: null,
    answering: false,
    error: null,
    ...overrides,
  };
}

function fixture(card = pendingCard(), language: "en" | "zh" = "en", accountId = "account") {
  const onAnswer = vi.fn(async (_decision: "approved" | "denied", _remember: boolean) => true);
  const onAnswered = vi.fn();
  const onExpired = vi.fn();
  function contents(value: ApprovalCardView) {
    return (
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <ApprovalCard
          card={value}
          accountId={accountId}
          onAnswer={onAnswer}
          onAnswered={onAnswered}
          onExpired={onExpired}
        />
      </BrowserLanguageProvider>
    );
  }
  const view = render(contents(card));
  return {
    ...view,
    onAnswer,
    onAnswered,
    onExpired,
    update: (value: ApprovalCardView) => view.rerender(contents(value)),
  };
}

afterEach(() => vi.useRealTimers());

it.each(["en", "zh"] as const)("shows another member's request read-only in %s", (language) => {
  const strings = { en, zh }[language].agents;
  fixture(pendingCard({ memberAccountId: "another-member" }), language);
  expect(screen.getByRole("heading", { name: strings.tools.writeFile })).toBeInTheDocument();
  expect(screen.getByText(/another-member/)).toBeInTheDocument();
  expect(screen.getByText(/notes\/report.txt/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: strings.approval.approve })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: strings.approval.deny })).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

it("sends the remembered exact-tool answer once and disables both controls while the owner is answering", async () => {
  const card = pendingCard();
  const view = fixture(card);
  let finish: ((accepted: boolean) => void) | undefined;
  view.onAnswer.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: en.agents.approval.alwaysTool }));
  fireEvent.click(screen.getByRole("button", { name: en.agents.approval.approve }));
  expect(view.onAnswer).toHaveBeenCalledExactlyOnceWith("approved", true);
  view.update({ ...card, answering: true });
  const approve = screen.getByRole("button", { name: en.agents.approval.approve });
  const deny = screen.getByRole("button", { name: en.agents.approval.deny });
  expect(approve).toBeDisabled();
  expect(deny).toBeDisabled();
  fireEvent.click(approve);
  fireEvent.click(deny);
  expect(view.onAnswer).toHaveBeenCalledTimes(1);
  await act(async () => finish?.(true));
  expect(view.onAnswered).toHaveBeenCalledOnce();
  view.update({ ...card, state: "approved", answeredByAccountId: "account" });
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByText(new RegExp(en.agents.approval.states.approved))).toBeInTheDocument();
});

it.each(["en", "zh"] as const)(
  "renders every resolved state and its answerer without controls in %s",
  (language) => {
    const strings = { en, zh }[language].agents;
    for (const state of ["approved", "denied", "expired", "cancelled"] as const) {
      const view = fixture(
        pendingCard({ state, answeredByAccountId: "reviewer-account" }),
        language,
      );
      expect(
        screen.getByText(new RegExp(strings.approval.states[state])).parentElement,
      ).toHaveTextContent("reviewer-account");
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      view.unmount();
    }
  },
);

it("escapes the bounded summary as literal text", () => {
  const summary = '<img src=x onerror="alert(1)">';
  const view = fixture(pendingCard({ argumentSummary: summary }));
  expect(screen.getByText(new RegExp("onerror"))).toHaveTextContent(summary);
  expect(view.container.querySelector("img")).toBeNull();
});

it("bounds both target and summary independently", () => {
  const view = fixture(
    pendingCard({ target: "x".repeat(1100), argumentSummary: "y".repeat(1100) }),
  );
  expect(view.container.querySelector("pre")?.textContent).toBe(
    `${"x".repeat(1024)}\n${"y".repeat(1024)}`,
  );
});

it.each(["en", "zh"] as const)(
  "names the exact-executable option for commands in %s",
  (language) => {
    const strings = { en, zh }[language].agents;
    fixture(
      pendingCard({ toolName: "computer_run_command", target: ".", argumentSummary: "git status" }),
      language,
    );
    expect(screen.getByRole("heading", { name: strings.tools.runCommand })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: strings.approval.alwaysExecutable })).toBeEnabled();
  },
);

it("allows a one-time approval after RULE_LIMIT without remembering", async () => {
  const view = fixture(pendingCard({ error: "ruleLimit" }));
  expect(screen.getByRole("checkbox", { name: en.agents.approval.alwaysTool })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: en.agents.approval.approve }));
  expect(view.onAnswer).toHaveBeenCalledExactlyOnceWith("approved", false);
  await waitFor(() => expect(view.onAnswered).toHaveBeenCalledOnce());
});

it("disables expired requests, refreshes once and clears the countdown on unmount", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  const view = fixture(pendingCard({ expiresAt: "2026-01-01T00:00:01.500Z" }));
  expect(screen.getByRole("button", { name: en.agents.approval.approve })).toBeEnabled();
  act(() => {
    vi.advanceTimersByTime(1500);
  });
  expect(screen.getByRole("button", { name: en.agents.approval.approve })).toBeDisabled();
  expect(screen.getByRole("button", { name: en.agents.approval.deny })).toBeDisabled();
  expect(view.onExpired).toHaveBeenCalledOnce();
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(view.onExpired).toHaveBeenCalledOnce();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps an unconfirmed or already-resolved answer inert without another answer", () => {
  const view = fixture(pendingCard({ error: "unconfirmed" }));
  fireEvent.click(screen.getByRole("button", { name: en.agents.approval.approve }));
  expect(view.onAnswer).not.toHaveBeenCalled();
  expect(screen.getByText(en.agents.approval.unconfirmed)).toBeInTheDocument();
  view.update(pendingCard({ error: "resolvedElsewhere" }));
  fireEvent.click(screen.getByRole("button", { name: en.agents.approval.deny }));
  expect(view.onAnswer).not.toHaveBeenCalled();
  expect(screen.getByText(en.agents.approval.resolvedElsewhere)).toBeInTheDocument();
});
