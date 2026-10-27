/** @vitest-environment jsdom */
import { expect, it } from "vite-plus/test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
  setupWorkspaceTests,
  state,
  device,
  mocks,
  page,
  runningTask,
} from "../../../../helpers/tasks/workspace";

setupWorkspaceTests();

it("opens older tasks after a short page and returns to newer tasks without losing the cursor", async () => {
  state.tasks = Array.from({ length: 3 }, (_, index) => ({
    id: crypto.randomUUID(),
    deviceId: device.id,
    projectId: device.projects[0]!.id,
    provider: "codex",
    mode: "run",
    prompt: `Task ${index + 1}`,
    status: "succeeded",
    summary: `Result ${index + 1}`,
    parentTaskId: null,
    createdAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
    updatedAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
  }));
  const original = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async (method, params) => {
    const value = await original(method, params);
    return method === "agents.local.list" ? value.slice(0, 1) : value;
  });
  await page();
  await screen.findByRole("button", { name: /Task 1/ });
  expect(screen.getByRole("button", { name: "Newer tasks" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Older tasks" }));
  await screen.findByRole("button", { name: /Task 2/ });
  fireEvent.click(screen.getByRole("button", { name: "Older tasks" }));
  fireEvent.click(await screen.findByRole("button", { name: /Task 3/ }));
  await screen.findByText("Result 3");
  expect(screen.getByRole("button", { name: "Older tasks" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Newer tasks" }));
  await screen.findByRole("button", { name: /Task 2/ });
  fireEvent.click(screen.getByRole("button", { name: "Newer tasks" }));
  await screen.findByRole("button", { name: /Task 1/ });
  expect(screen.getByRole("button", { name: "Newer tasks" }).hasAttribute("disabled")).toBe(true);
  expect(mocks.remote).not.toHaveBeenCalled();
});

it("keeps long task lists virtualized while keyboard navigation can reach every task", async () => {
  state.tasks = Array.from({ length: 100 }, (_, index) => ({
    id: crypto.randomUUID(),
    deviceId: device.id,
    projectId: device.projects[0]!.id,
    provider: "codex",
    mode: "run",
    prompt: `Virtual task ${index + 1}`,
    status: "succeeded",
    summary: `Virtual result ${index + 1}`,
    parentTaskId: null,
    createdAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
    updatedAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
  }));
  await page();
  const list = await screen.findByRole("list", { name: "Agent tasks" });
  const first = await within(list).findByRole("button", { name: /^Virtual task 1(?!\d)/ });
  expect(within(list).getAllByRole("listitem").length).toBeLessThan(20);
  expect(within(list).queryByRole("button", { name: /Virtual task 100/ })).toBeNull();
  fireEvent.keyDown(first, { key: "End" });
  const last = await within(list).findByRole("button", { name: /Virtual task 100/ });
  await waitFor(() => expect(document.activeElement).toBe(last));
  fireEvent.click(last);
  await screen.findByText("Virtual result 100");
  expect(last.getAttribute("aria-pressed")).toBe("true");
  fireEvent.keyDown(last, { key: "Home" });
  await waitFor(() => expect(document.activeElement).toBe(first));
  fireEvent.keyDown(first, { key: "ArrowDown" });
  const second = await within(list).findByRole("button", { name: /^Virtual task 2(?!\d)/ });
  await waitFor(() => expect(document.activeElement).toBe(second));
});

it("filters a project deep link and lets the user return to all projects", async () => {
  const first = runningTask();
  const second = {
    ...first,
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    prompt: "Other project task",
  };
  state.tasks = [first, second];
  await page(`/tasks?scope=local&project=${first.projectId}`);
  await screen.findByRole("button", { name: /Improve the current project/ });
  expect(screen.queryByRole("button", { name: /Other project task/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show all projects" }));
  await screen.findByRole("button", { name: /Other project task/ });
  expect(mocks.remote).not.toHaveBeenCalled();
});

it("restores keyboard focus to the selected task when returning from details", async () => {
  runningTask();
  await page();
  const row = await screen.findByRole("button", { name: /Improve the current project/ });
  fireEvent.click(row);
  fireEvent.click(await screen.findByRole("button", { name: "Back to tasks" }));
  await waitFor(() => expect(document.activeElement).toBe(row));
  expect(row).toHaveAttribute("aria-pressed", "true");
});
