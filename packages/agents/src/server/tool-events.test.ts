import { expect, it } from "vitest";
import type { conversationToolCalls } from "@raypx/database/schema";
import { toolActivityView } from "./tool-events.js";

function row(): typeof conversationToolCalls.$inferSelect {
  return {
    spaceId: "space",
    conversationId: "conversation",
    runId: "run",
    toolCallId: "call",
    toolName: "agent_page_update",
    target: "Space page",
    argumentSummary: "Page update",
    startedAt: new Date("2026-11-14T00:00:00.000Z"),
    finishedAt: new Date("2026-11-14T00:00:01.000Z"),
    outcome: "succeeded",
    durationMs: 1000,
    exitStatus: null,
    fence: 3,
    pageId: null,
    pageVersion: null,
  };
}

it("projects retained Page identity without reading the deleted Page or exposing persistence fields", () => {
  const stored = row();
  expect(toolActivityView(stored)).not.toHaveProperty("page");
  const activity = toolActivityView({ ...stored, pageId: "deleted-page", pageVersion: 4 });
  expect(activity.page).toEqual({ id: "deleted-page", version: 4 });
  expect(activity).not.toHaveProperty("fence");
  expect(activity).not.toHaveProperty("spaceId");
  expect(activity).not.toHaveProperty("pageId");
  expect(() => toolActivityView({ ...stored, pageId: "invalid", pageVersion: null })).toThrow(
    "version",
  );
});
