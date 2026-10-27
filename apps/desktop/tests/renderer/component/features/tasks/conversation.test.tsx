/** @vitest-environment jsdom */
import { expect, it } from "vite-plus/test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import {
  setupWorkspaceTests,
  state,
  mocks,
  page,
  runningTask,
} from "../../../../helpers/tasks/workspace";

setupWorkspaceTests();

it("shows safe Markdown, proposed Diff and original approval without rendering provider HTML or images", async () => {
  const task = runningTask(),
    now = new Date().toISOString();
  state.activity = [
    {
      id: crypto.randomUUID(),
      taskId: task.id,
      kind: "message",
      order: 1,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      status: "complete",
      truncated: false,
      text: "## Plan\n\n**Safe answer**\n\n[Bad link](javascript:alert(1))\n\n![Remote](https://example.com/pixel.png)\n\n<script>window.injected=true</script>",
    },
  ];
  state.request = {
    id: crypto.randomUUID(),
    taskId: task.id,
    kind: "permission",
    title: "Edit",
    body: JSON.stringify({ file_path: "src/app.ts", old_string: "before", new_string: "after" }),
    questions: [],
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    status: "pending",
    decision: null,
  };
  await page();
  fireEvent.click(await screen.findByRole("button", { name: /Improve the current project/ }));
  await screen.findByText("Safe answer");
  expect(document.querySelector("script")).toBeNull();
  expect(document.querySelector("img[src*=pixel]")).toBeNull();
  expect(screen.getByText("Bad link").closest("a")?.getAttribute("href") ?? "").not.toMatch(
    /^javascript:/,
  );
  expect(screen.getByRole("button", { name: "Send now" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Queue next turn" }).hasAttribute("disabled")).toBe(
    true,
  );
  expect(await screen.findByRole("cell", { name: "after" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Original request" }));
  await screen.findByText(state.request.body);
});

it("recovers an accepted queued input after a lost receipt without sending it again", async () => {
  const task = runningTask(),
    original = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async (method, params) => {
    if (method === "agents.local.execute" && params.request.method === "tasks.input") {
      const input = params.request.input,
        now = new Date().toISOString();
      state.activity = [
        {
          id: input.id,
          taskId: task.id,
          kind: "input",
          mode: input.mode,
          text: input.prompt,
          status: "queued",
          order: 1,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        },
      ];
      throw new Error("Lost receipt: private transport detail");
    }
    return original(method, params);
  });
  await page();
  fireEvent.click(await screen.findByRole("button", { name: /Improve the current project/ }));
  const input = await screen.findByRole("textbox", { name: "Add an instruction" });
  fireEvent.change(input, { target: { value: "Validate the change next" } });
  fireEvent.click(screen.getByRole("button", { name: "Queue next turn" }));
  await screen.findByText("Validate the change next");
  await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(""));
  expect(
    mocks.request.mock.calls.filter(
      ([method, params]) =>
        method === "agents.local.execute" && params.request.method === "tasks.input",
    ),
  ).toHaveLength(1);
  expect(document.body.textContent).not.toContain("private transport detail");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("runs and approves local tasks without signing in or reaching the cloud", async () => {
  mocks.user = null;
  await page();
  fireEvent.click(await screen.findByRole("button", { name: "New task" }));
  fireEvent.change(screen.getByRole("textbox", { name: "What should the agent do?" }), {
    target: { value: "Keep this task local" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send task" }));
  await screen.findByText("Run local tests");
  fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
  await screen.findByText("Private local result");
  expect(mocks.remote).not.toHaveBeenCalled();
  expect(
    mocks.request.mock.calls.every(
      ([method]) =>
        String(method).startsWith("agents.local.") || String(method).startsWith("memory."),
    ),
  ).toBe(true);
  fireEvent.click(screen.getByRole("tab", { name: "Connected computers" }));
  await screen.findByRole("heading", { name: "Sign in for remote access" });
  expect(mocks.remote).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "This computer" }));
  await screen.findByRole("button", { name: /Keep this task local/ });
});

it("shows local engine recovery feedback without exposing raw IPC errors", async () => {
  mocks.request.mockRejectedValue(new Error("Secret path and native error"));
  await page();
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("Unable to reach the local engine. Restart it and try again.");
  expect(document.body.textContent).not.toContain("Secret path");
  expect(mocks.remote).not.toHaveBeenCalled();
});

it("puts a completed result before the collapsed transcript and keeps full history available", async () => {
  const task = runningTask();
  state.tasks = [{ ...task, status: "succeeded", summary: "Validated the reconnect fix" }];
  const now = new Date().toISOString();
  state.activity = [
    {
      id: crypto.randomUUID(),
      taskId: task.id,
      kind: "message",
      order: 1,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      status: "complete",
      truncated: false,
      text: "Detailed execution transcript",
    },
  ];
  await page();
  fireEvent.click(await screen.findByRole("button", { name: /Improve the current project/ }));
  await screen.findByText("Validated the reconnect fix");
  expect(screen.queryByRole("region", { name: "Conversation" })).toBeNull();
  expect(screen.queryByText("Detailed execution transcript")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "View full conversation" }));
  await screen.findByText("Detailed execution transcript");
});
