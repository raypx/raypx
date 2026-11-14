import { expect, it, vi } from "vitest";
import { spaceIdSchema } from "@raypx/core/spaces";
import { conversationIdSchema } from "@raypx/core/agents";
import { runIdSchema } from "@raypx/core/conversation";
import { findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import { NotificationsList } from "./notifications.js";
it("lists member notifications across Spaces and marks the selected source before opening it", async () => {
  const item = {
    spaceId: spaceIdSchema.parse("space"),
    spaceName: "Shared Space",
    kind: "approval" as const,
    sourceId: "request",
    conversationId: conversationIdSchema.parse("conversation"),
    agentId: null,
    runId: runIdSchema.parse("run"),
    createdAt: new Date().toISOString(),
    unread: true,
  };
  const port = {
    list: vi.fn(async () => ({ items: [item], truncated: false })),
    read: vi.fn(async () => ({ ok: true as const })),
    viewed: vi.fn(),
  };
  const open = vi.fn();
  const view = await renderNative(
    <NotificationsList port={port} onOpen={open} onBack={() => {}} />,
  );
  expect(textContent(view.root)).toContain("Shared Space");
  expect(textContent(view.root)).toContain("Unread");
  await press(findByLabel(view.root, "Approval needed"));
  expect(port.read).toHaveBeenCalledWith({
    spaceId: item.spaceId,
    kind: item.kind,
    sourceId: item.sourceId,
  });
  expect(open).toHaveBeenCalledWith(item);
  await view.unmount();
});
