import { BrowserLanguageProvider } from "../../../tests/i18n.js";
import { Profiler, type ProfilerOnRenderCallback } from "react";
import { mockTaskLayout } from "../../../tests/helpers/layout.js";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { AgentTask, TaskActivity } from "@raypx/core/tasks";
import { Conversation } from "../conversation.js";

beforeEach(() => {
  mockTaskLayout("all");
  localStorage.setItem("raypx_locale", "en");
});
afterEach(() => vi.restoreAllMocks());
const task: AgentTask = {
  id: "task",
  deviceId: "device",
  projectId: "project",
  provider: "codex",
  mode: "run",
  prompt: "Original prompt",
  summary: "",
  status: "running",
  parentTaskId: null,
  createdAt: "2026-10-31T00:00:00.000Z",
  updatedAt: "2026-10-31T00:00:00.000Z",
};
const entries: TaskActivity[] = Array.from({ length: 200 }, (_, index) => ({
  id: `message-${index}`,
  taskId: task.id,
  order: index + 1,
  revision: 1,
  kind: "message",
  text: `Reply ${index} with [a result](https://example.com/${index})`,
  status: "complete",
  truncated: false,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
}));

it("bounds mounted rows and explicitly exposes every loaded message without fetching history", async () => {
  let commits = 0;
  let renderMs = 0;
  const onRender: ProfilerOnRenderCallback = (_id, _phase, duration) => {
    commits++;
    renderMs += duration;
  };
  const loadOlder = vi.fn(async () => {});
  const view = render(
    <Profiler id="conversation" onRender={onRender}>
      <BrowserLanguageProvider>
        <Conversation task={task} entries={entries} more loading={false} loadOlder={loadOlder} />
      </BrowserLanguageProvider>
    </Profiler>,
  );
  const region = screen.getByRole("region", { name: "Conversation" });
  await screen.findByText(/Reply 199 with/);
  expect(region.querySelectorAll("[data-conversation-row]").length).toBeLessThan(30);
  expect(screen.queryByText(/Reply 0 with/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show all loaded messages" }));
  expect(region).toHaveAttribute("data-conversation-mode", "full");
  expect(region.querySelectorAll("[data-conversation-row]")).toHaveLength(201);
  expect(screen.getByText(/Reply 0 with/)).toBeInTheDocument();
  expect(screen.getByText(/All loaded messages are shown/)).toBeInTheDocument();
  expect(loadOlder).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));
  expect(loadOlder).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Use virtual scrolling" }));
  await waitFor(() =>
    expect(region.querySelectorAll("[data-conversation-row]").length).toBeLessThan(30),
  );
  fireEvent.click(screen.getByRole("button", { name: "Show all loaded messages" }));
  view.rerender(
    <Profiler id="conversation" onRender={onRender}>
      <BrowserLanguageProvider>
        <Conversation
          task={{ ...task, id: "other-task" }}
          entries={[]}
          more={false}
          loading={false}
          loadOlder={loadOlder}
        />
      </BrowserLanguageProvider>
    </Profiler>,
  );
  expect(screen.getByRole("region", { name: "Conversation" })).toHaveAttribute(
    "data-conversation-mode",
    "virtual",
  );
  expect(screen.getByRole("button", { name: "Show all loaded messages" })).toBeInTheDocument();
  console.info(
    JSON.stringify({
      benchmark: "conversation-render",
      loadedRows: entries.length,
      commits,
      renderMs,
    }),
  );
});

it("keeps the focused link mounted when pointer scrolling leaves its virtual range", async () => {
  render(
    <BrowserLanguageProvider>
      <Conversation
        task={task}
        entries={entries}
        more={false}
        loading={false}
        loadOlder={async () => {}}
      />
    </BrowserLanguageProvider>,
  );
  await screen.findByText(/Reply 199 with/);
  const region = screen.getByRole("region", { name: "Conversation" });
  const link = screen.getAllByRole("link").at(-1)!;
  fireEvent.focus(link);
  link.focus();
  region.scrollTo({ top: 0 });
  await screen.findByText(/Reply 0 with/);
  expect(link.isConnected).toBe(true);
  expect(link).toHaveFocus();
  expect(region.querySelectorAll("[data-conversation-row]").length).toBeLessThan(30);
});

it.each(["virtual", "full"] as const)(
  "signals new output while reading earlier %s content and returns to latest without changing modes",
  async (mode) => {
    const loadOlder = vi.fn(async () => {});
    const element = (messages = entries) => (
      <BrowserLanguageProvider>
        <Conversation
          task={task}
          entries={messages}
          more={false}
          loading={false}
          loadOlder={loadOlder}
        />
      </BrowserLanguageProvider>
    );
    const view = render(element());
    const region = screen.getByRole("region", { name: "Conversation" });
    await screen.findByText(/Reply 199 with/);
    if (mode === "full")
      fireEvent.click(screen.getByRole("button", { name: "Show all loaded messages" }));
    vi.spyOn(region, "scrollHeight", "get").mockReturnValue(24000);
    region.scrollTo({ top: 1000 });
    await screen.findByRole("button", { name: "Back to latest" });
    const offset = region.scrollTop;
    view.rerender(
      element([
        ...entries,
        {
          ...entries[199]!,
          id: "new-message",
          order: 201,
          kind: "message",
          status: "streaming",
          truncated: false,
          text: "New streamed output",
        },
      ]),
    );
    const latest = await screen.findByRole("button", { name: "New output · Back to latest" });
    expect(region.scrollTop).toBe(offset);
    expect(region).toHaveAttribute("data-conversation-mode", mode);
    fireEvent.click(latest);
    expect(region).toHaveAttribute("data-conversation-mode", mode);
    expect(region).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "New output · Back to latest" }),
    ).not.toBeInTheDocument();
    expect(loadOlder).not.toHaveBeenCalled();
  },
);
