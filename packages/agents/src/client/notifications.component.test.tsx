import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import { spaceIdSchema } from "@raypx/core/spaces";
import { conversationIdSchema } from "@raypx/core/agents";
import { runIdSchema } from "@raypx/core/conversation";
import { NotificationsBell } from "./notifications.js";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
it("exposes unread state, reads the selected item and jumps to its exact source", async () => {
  const item = {
    spaceId: spaceIdSchema.parse("space"),
    spaceName: "Shared",
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
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <NotificationsBell port={port} onOpen={open} />
    </BrowserLanguageProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Notifications" })).toHaveAccessibleDescription(
      "1 unread",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
  await screen.findByRole("button", { name: /Approval needed/ });
  fireEvent.click(screen.getByRole("button", { name: /Approval needed/ }));
  await waitFor(() => expect(open).toHaveBeenCalledWith(item));
  expect(port.read).toHaveBeenCalledWith({
    spaceId: item.spaceId,
    kind: item.kind,
    sourceId: item.sourceId,
  });
  expect(port.read.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0]!);
});
