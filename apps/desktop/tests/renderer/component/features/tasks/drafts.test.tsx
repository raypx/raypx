/** @vitest-environment jsdom */
import { expect, it, vi } from "vite-plus/test";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import {
  setupWorkspaceTests,
  device,
  mocks,
  page,
  showDrafts,
  runningTask,
} from "../../../../helpers/tasks/workspace";

const { accountLocalTaskClient } = setupWorkspaceTests();

it("saves and restores local drafts without sending a task, and preserves unsaved text on cancel", async () => {
  const first = await page();
  const editor = await screen.findByRole("textbox", { name: "What should the agent do?" });
  fireEvent.change(editor, { target: { value: "Investigate local reconnects" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved on this device.");
  expect(mocks.request.mock.calls.some(([method]) => method === "agents.local.execute")).toBe(
    false,
  );
  fireEvent.click(screen.getByRole("button", { name: "New draft" }));
  expect(editor).toHaveValue("");
  fireEvent.change(editor, { target: { value: "Unsaved investigation" } });
  await showDrafts();
  fireEvent.click(screen.getByRole("button", { name: /^Investigate local reconnects/ }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(editor).toHaveValue("Unsaved investigation");
  first.unmount();
  await page();
  expect(await screen.findByRole("textbox", { name: "What should the agent do?" })).toHaveValue(
    "Unsaved investigation",
  );
  await showDrafts();
  fireEvent.click(await screen.findByRole("button", { name: /^Investigate local reconnects/ }));
  const discard = await screen.findByRole("alertdialog");
  fireEvent.click(within(discard).getByRole("button", { name: "Discard changes" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(screen.getByRole("textbox", { name: "What should the agent do?" })).toHaveValue(
    "Investigate local reconnects",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Delete draft: Investigate local reconnects" }),
  );
  expect(screen.queryByRole("region", { name: "Drafts" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "What should the agent do?" })).toHaveValue(
    "Investigate local reconnects",
  );
});

it("keeps draft text when device storage refuses a write", async () => {
  await page();
  const editor = await screen.findByRole("textbox", { name: "What should the agent do?" });
  fireEvent.change(editor, { target: { value: "Keep this text" } });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Quota exceeded");
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(
    "Unable to read or save drafts on this device. Your current text is still in the editor.",
  );
  expect(editor).toHaveValue("Keep this text");
  expect(screen.queryByRole("region", { name: "Drafts" })).toBeNull();
});

it("removes a sent draft only after the task is accepted", async () => {
  await page();
  const editor = await screen.findByRole("textbox", { name: "What should the agent do?" });
  fireEvent.change(editor, { target: { value: "Validate this saved draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByRole("region", { name: "Drafts" });
  fireEvent.click(screen.getByRole("button", { name: "Send task" }));
  await screen.findByText("Run local tests");
  expect(editor).toHaveValue("");
  expect(screen.queryByRole("region", { name: "Drafts" })).toBeNull();
});

it("keeps local drafts separate from drafts for connected computers", async () => {
  mocks.remote.mockResolvedValue([]);
  await page();
  const localEditor = await screen.findByRole("textbox", { name: "What should the agent do?" });
  fireEvent.change(localEditor, { target: { value: "Private local draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await showDrafts();
  await screen.findByRole("button", { name: /^Private local draft/ });
  fireEvent.click(screen.getByRole("tab", { name: "Connected computers" }));
  const remoteEditor = await screen.findByRole("textbox", { name: "What should the agent do?" });
  expect(screen.queryByRole("region", { name: "Drafts" })).toBeNull();
  fireEvent.change(remoteEditor, { target: { value: "Connected computer draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await showDrafts();
  await screen.findByRole("button", { name: /^Connected computer draft/ });
  fireEvent.click(screen.getByRole("tab", { name: "This computer" }));
  await showDrafts();
  await screen.findByRole("button", { name: /^Private local draft/ });
  expect(screen.queryByRole("button", { name: /^Connected computer draft/ })).toBeNull();
  expect(mocks.request.mock.calls.some(([method]) => method === "agents.local.execute")).toBe(
    false,
  );
});

it("preserves the local editor and owner through login, account switches, logout and remount", async () => {
  mocks.user = null;
  const first = await page();
  const editor = await screen.findByRole("textbox", { name: "What should the agent do?" });
  fireEvent.change(editor, { target: { value: "Device-owned unsent work" } });
  for (const user of [{ id: "account-a" }, { id: "account-b" }, null]) {
    await act(async () => {
      mocks.user = user;
      for (const listener of mocks.listeners) listener();
    });
    expect(screen.getByRole("textbox", { name: "What should the agent do?" })).toHaveValue(
      "Device-owned unsent work",
    );
  }
  first.unmount();
  await page();
  expect(await screen.findByRole("textbox", { name: "What should the agent do?" })).toHaveValue(
    "Device-owned unsent work",
  );
  expect(
    mocks.request.mock.calls.every(([method, params]) =>
      String(method).startsWith("memory.")
        ? params.accountId === undefined
        : params.accountId === LOCAL_WORKSPACE_ID,
    ),
  ).toBe(true);
  expect(mocks.request.mock.calls.some(([method]) => method === "agents.local.execute")).toBe(
    false,
  );
  expect(mocks.remote).not.toHaveBeenCalled();
});

it("keeps earlier account-owned drafts isolated instead of adopting them into the device workspace", async () => {
  const key = JSON.stringify([
    "raypx.task-drafts.v1",
    "https://api.example.test",
    "account-a",
    true,
  ]);
  localStorage.setItem(
    key,
    JSON.stringify([
      {
        id: "legacy-a",
        deviceId: device.id,
        projectId: device.projects[0]!.id,
        provider: "codex",
        mode: "run",
        prompt: "Account A private draft",
        updatedAt: new Date().toISOString(),
      },
    ]),
  );
  await page("/tasks?scope=local&history=account");
  await showDrafts();
  await screen.findByRole("button", { name: /^Account A private draft/ });
  await act(async () => {
    accountLocalTaskClient.setAccount("account-b");
    mocks.user = { id: "account-b" };
    for (const listener of mocks.listeners) listener();
  });
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: /^Account A private draft/ })).toBeNull(),
  );
  expect(await screen.findByRole("textbox", { name: "What should the agent do?" })).toHaveValue("");
  await act(async () => {
    accountLocalTaskClient.setAccount(null);
    mocks.user = null;
    for (const listener of mocks.listeners) listener();
  });
  await screen.findByRole("heading", { name: "Sign in for remote access" });
  expect(screen.queryByRole("textbox", { name: "What should the agent do?" })).toBeNull();
  expect(JSON.parse(localStorage.getItem(key)!)[0].prompt).toBe("Account A private draft");
  expect(mocks.remote).not.toHaveBeenCalled();
});

it("collapses an unsent editor without losing its text or creating a task", async () => {
  runningTask();
  await page();
  fireEvent.click(await screen.findByRole("button", { name: "Write a task" }));
  const editor = await screen.findByRole("textbox", { name: "What should the agent do?" });
  fireEvent.change(editor, { target: { value: "Keep this unsent investigation" } });
  fireEvent.click(screen.getByRole("button", { name: "Collapse task editor" }));
  expect(screen.queryByRole("textbox", { name: "What should the agent do?" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Write a task" }));
  expect(await screen.findByRole("textbox", { name: "What should the agent do?" })).toHaveValue(
    "Keep this unsent investigation",
  );
  expect(mocks.request.mock.calls.some(([method]) => method === "agents.local.execute")).toBe(
    false,
  );
});
