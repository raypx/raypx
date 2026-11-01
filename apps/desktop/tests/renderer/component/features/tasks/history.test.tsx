/** @vitest-environment happy-dom */
import { expect, it } from "vite-plus/test";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { rememberProject } from "../../../../../src/features/tasks/project-history";
import {
  setupWorkspaceTests,
  state,
  device,
  remoteDevice,
  mocks,
  page,
  runningTask,
} from "../../../../helpers/tasks/workspace";

setupWorkspaceTests();

it("retains an offline remote project, permits drafting and blocks sending", async () => {
  mocks.remote.mockResolvedValue([]);
  remoteDevice.online = false;
  try {
    const { router, unmount } = await page(
      `/tasks?scope=remote&project=${remoteDevice.projects[0]!.id}&device=${remoteDevice.id}`,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("This computer is offline.");
    const editor = await screen.findByRole("textbox", { name: "What should the agent do?" });
    fireEvent.change(editor, { target: { value: "Continue after reconnecting" } });
    expect(editor).toHaveValue("Continue after reconnecting");
    expect(screen.getByRole("button", { name: "Send session" })).toBeDisabled();
    expect(new URLSearchParams(router.state.location.searchStr).get("device")).toBe(
      remoteDevice.id,
    );
    unmount();
  } finally {
    remoteDevice.online = true;
  }
});

it("restores the most recent authorized project and skips unavailable history without executing", async () => {
  const projectId = device.projects[1]!.id;
  rememberProject(projectId);
  rememberProject(crypto.randomUUID());
  const { router } = await page();
  await screen.findByRole("heading", { name: "Second project" });
  await waitFor(() =>
    expect(new URLSearchParams(router.state.location.searchStr).get("project")).toBe(projectId),
  );
  expect(mocks.request.mock.calls.some(([method]) => method === "agents.local.execute")).toBe(
    false,
  );
  expect(mocks.remote).not.toHaveBeenCalled();
});

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
  expect(screen.getByRole("button", { name: "Newer sessions" }).hasAttribute("disabled")).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Older sessions" }));
  await screen.findByRole("button", { name: /Task 2/ });
  fireEvent.click(screen.getByRole("button", { name: "Older sessions" }));
  fireEvent.click(await screen.findByRole("button", { name: /Task 3/ }));
  await screen.findByText("Result 3");
  expect(screen.getByRole("button", { name: "Older sessions" }).hasAttribute("disabled")).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Newer sessions" }));
  await screen.findByRole("button", { name: /Task 2/ });
  fireEvent.click(screen.getByRole("button", { name: "Newer sessions" }));
  await screen.findByRole("button", { name: /Task 1/ });
  expect(screen.getByRole("button", { name: "Newer sessions" }).hasAttribute("disabled")).toBe(
    true,
  );
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
  const list = await screen.findByRole("list", { name: "Agent sessions" });
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

it("keeps project deep links scoped and resets the list when navigating projects", async () => {
  const first = runningTask();
  const second = {
    ...first,
    id: crypto.randomUUID(),
    projectId: device.projects[1]!.id,
    prompt: "Other project task",
  };
  state.tasks = [first, second];
  const { router } = await page(`/tasks?scope=local&project=${first.projectId}`);
  await screen.findByRole("button", { name: /Improve the current project/ });
  expect(screen.queryByRole("button", { name: /Other project task/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Show all projects" })).toBeNull();
  await act(() =>
    router.navigate({
      to: "/tasks",
      search: { scope: "local", device: device.id, project: second.projectId },
    }),
  );
  await screen.findByRole("button", { name: /Other project task/ });
  expect(screen.queryByRole("button", { name: /Improve the current project/ })).toBeNull();
  expect(
    mocks.request.mock.calls
      .filter(([method]) => method === "agents.local.list")
      .every(
        ([, input]) =>
          input.deviceId === device.id &&
          [first.projectId, second.projectId].includes(input.projectId),
      ),
  ).toBe(true);
  expect(mocks.remote).not.toHaveBeenCalled();
});

it("restores keyboard focus to the selected task when returning from details", async () => {
  runningTask();
  await page();
  const row = await screen.findByRole("button", { name: /Improve the current project/ });
  fireEvent.click(row);
  fireEvent.click(await screen.findByRole("button", { name: "Back to sessions" }));
  await waitFor(() => expect(document.activeElement).toBe(row));
  expect(row).toHaveAttribute("aria-pressed", "true");
});

it("resolves a session-only deep link to its original project and selects the follow-up child", async () => {
  const originalTask = {
    ...runningTask(),
    projectId: device.projects[1]!.id,
    status: "succeeded" as const,
    summary: "Original result",
  };
  state.tasks = [originalTask];
  const originalRequest = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async (method, params) => {
    if (method === "agents.local.execute" && params.request.method === "tasks.followUp") {
      const child = {
        ...originalTask,
        ...params.request.input,
        parentTaskId: originalTask.id,
        summary: "Follow-up result",
      };
      state.tasks = [child, originalTask];
      return { ok: true, value: child };
    }
    return originalRequest(method, params);
  });
  const { router } = await page(`/tasks?scope=local&taskId=${originalTask.id}`);
  await screen.findByText("Original result");
  expect(new URLSearchParams(router.state.location.searchStr).get("project")).toBe(
    originalTask.projectId,
  );
  expect(new URLSearchParams(router.state.location.searchStr).get("device")).toBe(device.id);
  fireEvent.change(screen.getByRole("textbox", { name: "Follow up in the same session" }), {
    target: { value: "Check the original project" },
  });
  fireEvent.submit(
    screen.getByRole("textbox", { name: "Follow up in the same session" }).closest("form")!,
  );
  await screen.findByText("Follow-up result");
  await waitFor(() =>
    expect(new URLSearchParams(router.state.location.searchStr).get("taskId")).toBe(
      state.tasks[0]!.id,
    ),
  );
  expect(state.tasks[0]).toMatchObject({
    projectId: originalTask.projectId,
    deviceId: device.id,
    parentTaskId: originalTask.id,
  });
});

it("keeps a revoked project selected and prevents execution instead of choosing another directory", async () => {
  const revokedProject = crypto.randomUUID();
  const { router } = await page(`/tasks?scope=local&project=${revokedProject}&device=${device.id}`);
  await screen.findByRole("alert");
  expect(new URLSearchParams(router.state.location.searchStr).get("project")).toBe(revokedProject);
  const editor = await screen.findByRole("textbox", { name: "What should the agent do?" });
  fireEvent.change(editor, { target: { value: "Do not run elsewhere" } });
  expect(screen.getByRole("button", { name: "Send session" })).toBeDisabled();
  fireEvent.submit(editor.closest("form")!);
  expect(mocks.request.mock.calls.some(([method]) => method === "agents.local.execute")).toBe(
    false,
  );
});
