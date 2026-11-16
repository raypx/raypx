import { Profiler } from "react";
import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { agentSchema, conversationSchema } from "@raypx/core/agents";
import { createSidebarStore } from "../model/sidebar.js";
import { SidebarStateProvider, useWorkspaceSidebar } from "./sidebar-state.js";
import { AgentDirectoryList } from "./agent-directory-list.js";

it("keeps the Agent list out of scroll and section preference renders", () => {
  const store = createSidebarStore("https://example.test", "member");
  const renderList = vi.fn();
  const at = "2026-11-15T00:00:00Z";
  const entries = [
    {
      agent: agentSchema.parse({
        id: "agent",
        spaceId: "space",
        name: "Writing Agent",
        instructions: "",
        model: { modelId: "fixture" },
        createdAt: at,
        updatedAt: at,
      }),
      conversation: conversationSchema.parse({
        id: "conversation",
        agentId: "agent",
        spaceId: "space",
        kind: "direct",
        createdAt: at,
      }),
    },
  ];
  const rowButtons = { current: new Map<string, HTMLElement>() };
  const actions = { current: { choose: vi.fn(), menu: () => null } };
  function List() {
    const selectedId = useWorkspaceSidebar((state) => state.agentId);
    return (
      <Profiler id="agents" onRender={renderList}>
        <AgentDirectoryList
          entries={entries}
          selectedId={selectedId}
          rowClass=""
          rowButtons={rowButtons}
          actions={actions}
        />
      </Profiler>
    );
  }
  render(
    <SidebarStateProvider store={store}>
      <List />
    </SidebarStateProvider>,
  );
  expect(screen.getByRole("button", { name: "Writing Agent" })).toBeVisible();
  const before = renderList.mock.calls.length;
  act(() => {
    store.getState().setScrollTop(130);
    store.getState().setCollapsed("groups", true);
    store.getState().setCollapsed("recent", true);
  });
  expect(renderList).toHaveBeenCalledTimes(before);
  act(() => store.getState().select({ spaceId: "space", agentId: "agent" }));
  expect(renderList.mock.calls.length).toBeGreaterThan(before);
  expect(screen.getByRole("button", { name: "Writing Agent" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
