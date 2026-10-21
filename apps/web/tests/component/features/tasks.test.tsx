import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { TaskWorkspace } from "@raypx/tasks/client";
import type { TaskClient } from "@raypx/client";

beforeEach(() => {
  // jsdom has no layout; provide dimensions for the real virtualizer.
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
    return this.hasAttribute("data-task-list") ? 480 : 0;
  });
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(480);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(96);
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
afterEach(() => vi.restoreAllMocks());

async function workspace() {
  const task = {
    id: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "Original task",
    status: "succeeded" as const,
    summary: "Done",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const followUp = vi.fn(async (input: { id: string; prompt: string }) => ({
    ...task,
    ...input,
    parentTaskId: task.id,
  }));
  const client = {
    tasks: {
      list: async () => [task],
      get: async () => ({ task, events: [], requests: [] }),
      followUp,
    },
    devices: { list: async () => [] },
    approvals: { list: async () => [] },
  } as unknown as TaskClient;
  render(
    <BrowserLanguageProvider>
      <TaskWorkspace client={client} accountId="account" />
    </BrowserLanguageProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Original task/ }));
  const input = await screen.findByRole("textbox", { name: "Follow up in the same session" });
  const submit = () => fireEvent.submit(input.closest("form")!);
  return { followUp, input, submit };
}

it("creates a new task when the same follow-up text is submitted again after success", async () => {
  const { followUp, input, submit } = await workspace();
  fireEvent.change(input, { target: { value: "Run tests again" } });
  submit();
  await waitFor(() => expect(input).toHaveValue(""));
  const firstId = followUp.mock.calls[0]![0].id;
  fireEvent.change(input, { target: { value: "Run tests again" } });
  submit();
  await waitFor(() => expect(followUp).toHaveBeenCalledTimes(2));
  expect(followUp.mock.calls[1]![0].id).not.toBe(firstId);
});

it("keeps the follow-up ID for an ambiguous retry and clears it after confirmed success", async () => {
  const { followUp, input, submit } = await workspace();
  followUp.mockRejectedValueOnce(new Error("Response lost"));
  fireEvent.change(input, { target: { value: "Run tests again" } });
  submit();
  await screen.findByRole("alert");
  const firstId = followUp.mock.calls[0]![0].id;
  submit();
  await waitFor(() => expect(input).toHaveValue(""));
  expect(followUp.mock.calls[1]![0].id).toBe(firstId);
  fireEvent.change(input, { target: { value: "Run tests again" } });
  submit();
  await waitFor(() => expect(followUp).toHaveBeenCalledTimes(3));
  expect(followUp.mock.calls[2]![0].id).not.toBe(firstId);
});
