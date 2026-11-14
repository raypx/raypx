import type { ComponentProps } from "react";
import type { ApprovalCardView } from "@raypx/agents/model";
import { Linking } from "../../tests/mocks/react-native.js";
import { approvalRequestIdSchema, openApiToolNameSchema } from "@raypx/core/approvals";
import { pageIdSchema } from "@raypx/core/pages";
import { afterEach, expect, it, vi } from "vitest";
import { toolActivitySchema } from "@raypx/core/conversation";
import en from "@raypx/agents/messages/en";
import zh from "@raypx/agents/messages/zh";
import { findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import { useLocales } from "../../tests/mocks/localization.js";
import { ToolActivity } from "./tool-activity.js";

const call = toolActivitySchema.parse({
  runId: "run",
  toolCallId: "read-call",
  toolName: "computer_read_file",
  target: "notes.txt",
  argumentSummary: "Read a file",
  startedAt: "2026-11-14T00:00:00.000Z",
  finishedAt: null,
  outcome: null,
  durationMs: null,
  exitStatus: null,
});
function row(activity = [call], pendingCount = 0): ComponentProps<typeof ToolActivity>["row"] {
  return {
    id: "activity:run",
    kind: "activity",
    sender: "approval",
    sequence: 2.6,
    runId: call.runId,
    activity,
    pendingCount,
  };
}
afterEach(() => useLocales.mockReset());

it.each(["en", "zh"] as const)(
  "collapses read-tool activity without rendering private contents in %s",
  async (language) => {
    useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
    const messages = { en, zh }[language].agents;
    const privateCall = {
      ...call,
      arguments: { content: "PRIVATE BODY" },
      output: "PRIVATE OUTPUT",
    };
    const view = await renderNative(
      <ToolActivity origin="https://app.example.test" spaceId="space" row={row([privateCall])} />,
    );
    const label = view.root.find(
      (node) => typeof node.type === "string" && node.props.accessibilityState?.expanded === false,
    ).props.accessibilityLabel as string;
    expect(textContent(view.root)).not.toContain("notes.txt");
    expect(label).toContain(messages.activity.outcomes.running);
    await press(findByLabel(view.root, label));
    expect(findByLabel(view.root, label).props.accessibilityState.expanded).toBe(true);
    expect(textContent(view.root)).toContain(messages.tools.readFile);
    expect(textContent(view.root)).toContain("notes.txt");
    expect(textContent(view.root)).not.toContain("PRIVATE BODY");
    expect(textContent(view.root)).not.toContain("PRIVATE OUTPUT");
    await press(findByLabel(view.root, label));
    expect(textContent(view.root)).not.toContain("notes.txt");
    await view.unmount();
  },
);

it.each(["succeeded", "failed", "refused", "cancelled", "unknown"] as const)(
  "renders %s with duration and failed-command exit status",
  async (outcome) => {
    const view = await renderNative(
      <ToolActivity
        origin="https://app.example.test"
        spaceId="space"
        row={row([
          {
            ...call,
            toolName: "computer_run_command",
            outcome,
            finishedAt: "2026-11-14T00:00:01.500Z",
            durationMs: 1_500,
            exitStatus: 7,
          },
        ])}
      />,
    );
    const trigger = view.root.find(
      (node) => typeof node.type === "string" && node.props.accessibilityState?.expanded === false,
    );
    await press(trigger);
    const content = textContent(view.root);
    expect(content).toContain(en.agents.activity.outcomes[outcome]);
    expect(content).toContain("1.5 s");
    expect(content.includes("Exit status 7")).toBe(outcome === "failed");
    await view.unmount();
  },
);

it("surfaces waiting and failed calls on the collapsed summary", async () => {
  const view = await renderNative(
    <ToolActivity origin="https://app.example.test" spaceId="space" row={row([], 1)} />,
  );
  expect(
    findByLabel(view.root, "1 step · Waiting for approval").props.accessibilityState.expanded,
  ).toBe(false);
  await view.update(
    <ToolActivity
      origin="https://app.example.test"
      spaceId="space"
      row={row([{ ...call, outcome: "failed" }])}
    />,
  );
  expect(findByLabel(view.root, "1 step · 1 failed").props.accessibilityState.expanded).toBe(false);
  await view.unmount();
});

it.each(["en", "zh"] as const)(
  "uses the same built-in and remote activity labels in %s",
  async (language) => {
    useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
    const labels = { en, zh }[language].agents.tools;
    const names = [
      "agent_page_create",
      "agent_page_update",
      "agent_page_read",
      "agent_skill_load",
      "agent_skill_save",
      "mcp_server__read_page",
    ];
    const view = await renderNative(
      <ToolActivity
        origin="https://app.example.test"
        spaceId="space"
        row={row(
          names.map((toolName, index) => ({ ...call, toolName, toolCallId: `call-${index}` })),
        )}
      />,
    );
    const trigger = view.root.find(
      (node) => typeof node.type === "string" && node.props.accessibilityState?.expanded === false,
    );
    await press(trigger);
    const content = textContent(view.root);
    for (const label of [
      labels.createPage,
      labels.updatePage,
      labels.readPage,
      labels.loadSkill,
      labels.saveSkill,
      "MCP / read page",
    ])
      expect(content).toContain(label);
    await view.unmount();
  },
);

it.each([null, { id: pageIdSchema.parse("exact-page"), version: 2 }])(
  "hands Page activity to Web using only its server identity: %j",
  async (page) => {
    vi.mocked(Linking.openURL).mockClear();
    const view = await renderNative(
      <ToolActivity
        origin="https://app.example.test"
        spaceId="space"
        row={row([{ ...call, toolName: "agent_page_update", target: "not-an-id", page }])}
      />,
    );
    await press(findByLabel(view.root, "1 step · In progress"));
    await press(findByLabel(view.root, en.agents.tools.updatePage));
    const suffix = page ? "&pageId=exact-page" : "";
    expect(Linking.openURL).toHaveBeenCalledExactlyOnceWith(
      `https://app.example.test/pages?spaceId=space${suffix}`,
    );
    await view.unmount();
  },
);

it("shows a recoverable error when the system cannot open a Page", async () => {
  vi.mocked(Linking.openURL).mockRejectedValueOnce(new Error("Unavailable"));
  const view = await renderNative(
    <ToolActivity
      origin="https://app.example.test"
      spaceId="space"
      row={row([{ ...call, toolName: "agent_page_read", page: null }])}
    />,
  );
  await press(findByLabel(view.root, "1 step · In progress"));
  await press(findByLabel(view.root, en.agents.tools.readPage));
  expect(textContent(view.root)).toContain("Could not open the link.");
  await view.unmount();
});

it.each(["en", "zh"] as const)(
  "renders HTTP activity labels and read classification in %s",
  async (language) => {
    useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
    const view = await renderNative(
      <ToolActivity
        origin="https://app.example.test"
        spaceId="space"
        row={row([
          {
            ...call,
            toolName: openApiToolNameSchema.parse(
              "openapi_0123456789abcdef0123456789abcdef__getItem",
            ),
            target: "GET https://api.example.test/items/1",
            argumentSummary: "GET Read inventory item",
          },
        ])}
      />,
    );
    const trigger = view.root.find(
      (node) => typeof node.type === "string" && node.props.accessibilityState?.expanded === false,
    );
    await press(trigger);
    expect(textContent(view.root)).toContain("Read inventory item");
    expect(textContent(view.root)).toContain({ en, zh }[language].agents.openapi.readOnly);
    await view.unmount();
  },
);

it("uses the replacement member answer instead of an older automatic approval", async () => {
  const old: ApprovalCardView = {
    requestId: approvalRequestIdSchema.parse("old-auto"),
    runId: call.runId,
    toolCallId: call.toolCallId,
    toolName: "computer_read_file",
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
    review: { ...old.review!, verdict: "ask" },
  };
  const tree = (answers: ApprovalCardView[]) => (
    <ToolActivity
      origin="https://app.example.test"
      spaceId="space"
      row={row([{ ...call, finishedAt: call.startedAt, outcome: "succeeded" }])}
      answers={answers}
      memberName={() => "Ari"}
    />
  );
  const view = await renderNative(tree([old]));
  await press(findByLabel(view.root, "1 step"));
  expect(textContent(view.root)).toContain("Approved automatically");
  await view.update(tree([old, replacement]));
  expect(textContent(view.root)).not.toContain("Approved automatically");
  await view.update(
    tree([old, { ...replacement, state: "approved", answeredByAccountId: "member" }]),
  );
  expect(textContent(view.root)).not.toContain("Approved automatically");
  expect(textContent(view.root)).toContain("Answered by Ari");
  await view.unmount();
});
