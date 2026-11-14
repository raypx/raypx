import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react-test-renderer";
import type { ApprovalCardView } from "@raypx/agents/model";
import {
  approvalRequestIdSchema,
  mcpToolNameSchema,
  openApiToolNameSchema,
} from "@raypx/core/approvals";
import { runIdSchema } from "@raypx/core/conversation";
import { findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import en from "@raypx/agents/messages/en";
import zh from "@raypx/agents/messages/zh";
import { useLocales } from "../../tests/mocks/localization.js";
import { ApprovalCard } from "./approval-card.js";

function card(patch: Partial<ApprovalCardView> = {}): ApprovalCardView {
  return {
    requestId: approvalRequestIdSchema.parse("approval-1"),
    runId: runIdSchema.parse("run-1"),
    toolName: "computer_write_file",
    target: "notes.txt",
    argumentSummary: "Write notes.txt",
    memberAccountId: "member-1",
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    createdAt: new Date(Date.now()).toISOString(),
    sequence: 3,
    state: "pending",
    answeredByAccountId: null,
    answering: false,
    error: null,
    ...patch,
  };
}

afterEach(() => {
  vi.useRealTimers();
  useLocales.mockReset();
});

describe("native approval card", () => {
  it.each(["en", "zh"] as const)(
    "attributes a group approval to its Agent in %s",
    async (locale) => {
      useLocales.mockReturnValue([{ languageTag: locale, languageCode: locale }]);
      const answer = vi.fn();
      const view = await renderNative(
        <ApprovalCard
          card={card()}
          accountId="member-1"
          agentName="Writer"
          onAnswer={answer}
          onRefresh={vi.fn()}
        />,
      );
      expect(textContent(view.root)).toContain(
        { en, zh }[locale].agents.approval.requestedBy.replace("{name}", "Writer"),
      );
      expect(answer).not.toHaveBeenCalled();
      await view.unmount();
    },
  );
  it("submits an explicit approval and remembered exact-tool choice, then follows resolution", async () => {
    const request = card();
    const answer = vi.fn();
    const refresh = vi.fn();
    const view = await renderNative(
      <ApprovalCard card={request} accountId="member-1" onAnswer={answer} onRefresh={refresh} />,
    );
    expect(textContent(view.root)).toContain("notes.txt");
    expect(answer).not.toHaveBeenCalled();
    await act(async () => {
      findByLabel(view.root, "Always allow this exact tool").props.onSelectedChange(true);
    });
    await press(findByLabel(view.root, "Approve"));
    expect(answer).toHaveBeenCalledWith(request.requestId, "approved", true);
    await view.update(
      <ApprovalCard
        card={{ ...request, state: "approved", answeredByAccountId: "member-1" }}
        accountId="member-1"
        onAnswer={answer}
        onRefresh={refresh}
      />,
    );
    expect(textContent(view.root)).toContain("Approved");
    expect(view.root.findAllByProps({ accessibilityLabel: "Approve" })).toHaveLength(0);
    await view.unmount();
  });

  it("keeps one-time approval available at the rule limit and sends denial without remembering", async () => {
    const request = card({ error: "ruleLimit" });
    const answer = vi.fn();
    const view = await renderNative(
      <ApprovalCard card={request} accountId="member-1" onAnswer={answer} onRefresh={vi.fn()} />,
    );
    expect(textContent(view.root)).toContain("The Allow list is full");
    expect(findByLabel(view.root, "Always allow this exact tool").props.isDisabled).toBe(true);
    await press(findByLabel(view.root, "Approve"));
    expect(answer).toHaveBeenCalledWith(request.requestId, "approved", false);
    await press(findByLabel(view.root, "Deny"));
    expect(answer).toHaveBeenLastCalledWith(request.requestId, "denied");
    await view.unmount();
  });

  it("renders another recipient's request without answer controls", async () => {
    const answer = vi.fn();
    const view = await renderNative(
      <ApprovalCard card={card()} accountId="member-2" onAnswer={answer} onRefresh={vi.fn()} />,
    );
    expect(textContent(view.root)).toContain("Waiting for Member");
    expect(view.root.findAllByProps({ accessibilityLabel: "Approve" })).toHaveLength(0);
    expect(answer).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("refreshes an elapsed request once and waits for server expiry", async () => {
    vi.useFakeTimers();
    const request = card({ expiresAt: new Date(Date.now() + 1_000).toISOString() });
    const refresh = vi.fn();
    const view = await renderNative(
      <ApprovalCard card={request} accountId="member-1" onAnswer={vi.fn()} onRefresh={refresh} />,
    );
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(textContent(view.root)).toContain("Time elapsed; confirming expiry");
    expect(findByLabel(view.root, "Approve").props.isDisabled).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    await view.unmount();
  });
});

it.each(["en", "zh"] as const)(
  "uses shared Page, skill and remote labels in %s",
  async (language) => {
    useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
    const labels = { en, zh }[language].agents.tools;
    const cases = [
      ["agent_page_create", labels.createPage],
      ["agent_page_update", labels.updatePage],
      ["agent_page_read", labels.readPage],
      ["agent_skill_load", labels.loadSkill],
      ["agent_skill_save", labels.saveSkill],
      [mcpToolNameSchema.parse("mcp_server__read_page"), "MCP server / read page"],
    ] as const;
    for (const [toolName, label] of cases) {
      const view = await renderNative(
        <ApprovalCard
          card={card({ toolName })}
          accountId="member-1"
          onAnswer={vi.fn()}
          onRefresh={vi.fn()}
        />,
      );
      expect(textContent(view.root)).toContain(label);
      await view.unmount();
    }
  },
);

it.each(["en", "zh"] as const)(
  "renders HTTP operation approval labels and classification in %s",
  async (language) => {
    useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
    const view = await renderNative(
      <ApprovalCard
        card={card({
          toolName: openApiToolNameSchema.parse(
            "openapi_0123456789abcdef0123456789abcdef__createItem",
          ),
          target: "POST https://api.example.test/items",
          argumentSummary: "POST Create inventory item",
        })}
        accountId="member-1"
        onAnswer={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(textContent(view.root)).toContain("Create inventory item");
    expect(textContent(view.root)).toContain({ en, zh }[language].agents.openapi.mutating);
    await view.unmount();
  },
);
