import type { ComponentProps } from "react";
import { afterEach, expect, it } from "vitest";
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
    const view = await renderNative(<ToolActivity row={row([privateCall])} />);
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
  const view = await renderNative(<ToolActivity row={row([], 1)} />);
  expect(
    findByLabel(view.root, "Used 1 tool · Waiting for approval").props.accessibilityState.expanded,
  ).toBe(false);
  await view.update(<ToolActivity row={row([{ ...call, outcome: "failed" }])} />);
  expect(findByLabel(view.root, "Used 1 tool · 1 failed").props.accessibilityState.expanded).toBe(
    false,
  );
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
      "MCP server / read page",
    ])
      expect(content).toContain(label);
    await view.unmount();
  },
);
