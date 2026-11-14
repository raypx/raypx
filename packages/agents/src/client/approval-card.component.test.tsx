import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import {
  approvalRequestIdSchema,
  mcpToolNameSchema,
  openApiToolNameSchema,
} from "@raypx/core/approvals";
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

it.each(["en", "zh"] as const)(
  "identifies the device, directory, command and OS permissions in %s",
  (language) => {
    const strings = { en, zh }[language].agents;
    fixture(
      pendingCard({
        toolName: "computer_run_command",
        device: {
          id: "018e2c42-08e0-4000-8000-000000000001",
          name: "My device",
          directory: "/granted/project",
          command: "echo hello",
        },
      }),
      language,
    );
    expect(screen.getByText(/My device/)).toBeInTheDocument();
    expect(screen.getByText("/granted/project")).toBeInTheDocument();
    expect(screen.getByText("echo hello")).toBeInTheDocument();
    expect(screen.getByText(strings.devices.warning)).toBeInTheDocument();
  },
);

it.each(["en", "zh"] as const)("shows another member's request read-only in %s", (language) => {
  const strings = { en, zh }[language].agents;
  fixture(pendingCard({ memberAccountId: "another-member" }), language);
  expect(screen.getByRole("heading", { name: strings.tools.writeFile })).toBeInTheDocument();
  expect(
    screen.getByText(language === "en" ? "Waiting for another-member" : "等待another-member审批"),
  ).toBeInTheDocument();
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
  expect(view.container.querySelector("[data-approval-card]")).toBeNull();
});

it.each(["approved", "denied", "expired", "cancelled"] as const)(
  "omits the full card after %s resolution",
  (state) => {
    const view = fixture(pendingCard({ state, answeredByAccountId: "reviewer-account" }));
    expect(view.container.querySelector("[data-approval-card]")).toBeNull();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  },
);

it("escapes the bounded summary as literal text", () => {
  const summary = '<img src=x onerror="alert(1)">';
  const view = fixture(pendingCard({ argumentSummary: summary }));
  expect(screen.getByText(new RegExp("onerror"))).toHaveTextContent(summary);
  expect(view.container.querySelector("img")).toBeNull();
});

it("keeps direct approval cards free of Agent and child-task labels", () => {
  const view = fixture();
  expect(view.container.querySelector("[data-approval-agent]")).toBeNull();
  expect(view.container.querySelector("[data-approval-task]")).toBeNull();
});

it("bounds both target and summary independently", () => {
  const view = fixture(
    pendingCard({ target: "x".repeat(1100), argumentSummary: "y".repeat(1100) }),
  );
  expect(view.container.querySelector("code")?.textContent).toBe("x".repeat(1024));
  expect(view.container.querySelector("pre")?.textContent).toBe("y".repeat(1024));
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

it.each(["en", "zh"] as const)(
  "omits the viewer addressee and repeated arguments in %s",
  (language) => {
    const view = fixture(
      pendingCard({
        target: "browser-fixture.txt",
        argumentSummary: "Write file: browser-fixture.txt",
      }),
      language,
    );
    expect(screen.getAllByText("browser-fixture.txt", { exact: true })).toHaveLength(1);
    expect(view.container.querySelector("pre")).toBeNull();
    expect(screen.queryByText(/For You|审批人/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiting for account|等待account/)).not.toBeInTheDocument();
  },
);

it.each([
  ["en", 600, "10 min left"],
  ["en", 599, "10 min left"],
  ["en", 61, "2 min left"],
  ["en", 60, "60 s left"],
  ["en", 45, "45 s left"],
  ["en", 1, "1 s left"],
  ["zh", 600, "剩余10分钟"],
  ["zh", 599, "剩余10分钟"],
  ["zh", 61, "剩余2分钟"],
  ["zh", 60, "剩余60秒"],
  ["zh", 45, "剩余45秒"],
  ["zh", 1, "剩余1秒"],
] as const)("formats a silent %s deadline at %i seconds", (language, seconds, expected) => {
  vi.useFakeTimers();
  const now = Date.parse("2026-01-01T00:00:00Z");
  vi.setSystemTime(now);
  fixture(pendingCard({ expiresAt: new Date(now + seconds * 1000).toISOString() }), language);
  const deadline = screen.getByText(expected);
  expect(deadline).toHaveAttribute("aria-live", "off");
  expect(deadline.classList.contains("font-medium")).toBe(seconds <= 60);
});

it.each(["en", "zh"] as const)(
  "tags a child approval without granting another member control in %s",
  (language) => {
    const strings = { en, zh }[language].agents;
    const view = render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <ApprovalCard
          card={pendingCard({ memberAccountId: "another-member" })}
          accountId="account"
          agentName="研究 Agent"
          taskSummary={"x".repeat(300)}
          onAnswer={vi.fn()}
          onAnswered={vi.fn()}
          onExpired={vi.fn()}
        />
      </BrowserLanguageProvider>,
    );
    expect(view.container.querySelector("[data-approval-agent]")).toHaveTextContent("研究 Agent");
    expect(view.container.querySelector("[data-approval-task]")).toHaveTextContent("x".repeat(240));
    expect(view.container.querySelector("[data-approval-task]")).not.toHaveTextContent(
      "x".repeat(241),
    );
    expect(
      screen.queryByRole("button", { name: strings.approval.approve }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  },
);

it("updates only the deadline on each tick and switches from minutes to seconds", async () => {
  vi.useFakeTimers();
  const now = Date.parse("2026-01-01T00:00:00Z");
  vi.setSystemTime(now);
  const view = fixture(pendingCard({ expiresAt: new Date(now + 61_000).toISOString() }));
  const card = view.container.querySelector("article")!;
  const mutations: MutationRecord[] = [];
  const observer = new MutationObserver((entries) => mutations.push(...entries));
  observer.observe(card, { attributes: true, subtree: true, childList: true, characterData: true });
  expect(screen.getByText("2 min left")).toBeInTheDocument();
  await act(async () => vi.advanceTimersByTime(1000));
  expect(screen.getByText("60 s left")).toBeInTheDocument();
  await act(async () => vi.advanceTimersByTime(15_000));
  expect(screen.getByText("45 s left")).toBeInTheDocument();
  expect(mutations.length).toBeGreaterThan(0);
  expect(
    mutations.every((mutation) => {
      const node =
        mutation.target.nodeType === Node.ELEMENT_NODE
          ? (mutation.target as Element)
          : mutation.target.parentElement;
      return node?.closest("[data-approval-deadline]") !== null;
    }),
  ).toBe(true);
  observer.disconnect();
});

it.each([
  { language: "en" as const, toolName: "agent_memory_save" as const, label: "Save memory" },
  { language: "zh" as const, toolName: "agent_memory_save" as const, label: "保存记忆" },
  { language: "en" as const, toolName: "agent_memory_update" as const, label: "Update memory" },
  { language: "zh" as const, toolName: "agent_memory_update" as const, label: "更新记忆" },
  { language: "en" as const, toolName: "agent_page_create" as const, label: "Create page" },
  { language: "zh" as const, toolName: "agent_page_create" as const, label: "创建页面" },
  { language: "en" as const, toolName: "agent_page_update" as const, label: "Update page" },
  { language: "zh" as const, toolName: "agent_page_update" as const, label: "更新页面" },
  { language: "en" as const, toolName: "agent_page_read" as const, label: "Read page" },
  { language: "zh" as const, toolName: "agent_page_read" as const, label: "读取页面" },
  { language: "en" as const, toolName: "agent_skill_load" as const, label: "Load skill" },
  { language: "zh" as const, toolName: "agent_skill_load" as const, label: "加载技能" },
  { language: "en" as const, toolName: "agent_skill_save" as const, label: "Save skill" },
  { language: "zh" as const, toolName: "agent_skill_save" as const, label: "保存技能" },
])("names $toolName plainly on approval cards in $language", ({ language, toolName, label }) => {
  fixture(pendingCard({ toolName, target: "Agent memory" }), language);
  expect(screen.getByRole("heading", { name: label })).toBeVisible();
  expect(screen.queryByText(toolName)).toBeNull();
});

it.each(["en", "zh"] as const)("renders remote tool names as text in %s", (language) => {
  fixture(pendingCard({ toolName: mcpToolNameSchema.parse("mcp_server__read_page") }), language);
  expect(screen.getByRole("heading", { name: "MCP server / read page" })).toBeVisible();
});

it.each(["en", "zh"] as const)(
  "shows readable HTTP approval labels and change classification in %s",
  (language) => {
    fixture(
      pendingCard({
        toolName: openApiToolNameSchema.parse(
          "openapi_0123456789abcdef0123456789abcdef__createItem",
        ),
        target: "POST https://api.example.test/items",
        argumentSummary: "POST Create inventory item",
      }),
      language,
    );
    expect(screen.getByRole("heading", { name: "Create inventory item" })).toBeVisible();
    expect(screen.getByText({ en, zh }[language].agents.openapi.mutating)).toBeVisible();
    expect(screen.getByText("POST https://api.example.test/items")).toBeVisible();
  },
);
