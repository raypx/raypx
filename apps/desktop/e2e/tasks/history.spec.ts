import { registerTests } from "@raypx/e2e/journeys/tasks/history";
import {
  test,
  desktop,
  capture,
  authResponse,
  connectedProject,
  signedInAccount,
} from "@raypx/e2e/testing";
import { expect } from "@playwright/test";

test(
  "Desktop opens local work first and navigates to remote projects",
  { tag: "@desktop" },
  async ({ page }) => {
    await signedInAccount(page);
    let remoteReads = 0;
    await page.route("**/rpc/tasks/list", async (route) => {
      remoteReads++;
      await authResponse(route, { json: [] });
    });
    await page.goto(desktop + "/tasks");
    await expect(
      page.getByText("Open the desktop app to use local tools.", { exact: true }),
    ).toBeVisible();
    expect(remoteReads).toBe(0);
    await capture(page, {
      path: test.info().outputPath("local-tasks-preview.png"),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Browse remote projects", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await expect(page.getByText(/Turn on remote access in Desktop/)).toBeVisible();
    expect(remoteReads).toBe(0);
    await page.goto(desktop + "/tasks#settings");
    await page.getByRole("radio", { name: "Dark", exact: true }).check();
    await page.getByRole("combobox", { name: "Language", exact: true }).click();
    await page.getByRole("option", { name: "简体中文", exact: true }).click();
    await page.goto(desktop + "/tasks");
    await expect(page.getByText("请打开桌面应用以使用本地工具。", { exact: true })).toBeVisible();
    await capture(page, {
      path: test.info().outputPath("local-tasks-preview-dark-zh.png"),
      fullPage: true,
    });
  },
);

test(
  "Desktop task pagination keeps short pages reachable in both directions",
  { tag: "@desktop" },
  async ({ page }) => {
    await signedInAccount(page);
    const deviceId = crypto.randomUUID(),
      projectId = crypto.randomUUID();
    await connectedProject(page, deviceId, projectId);
    const tasks = Array.from({ length: 3 }, (_, index) => ({
      id: crypto.randomUUID(),
      deviceId,
      projectId,
      provider: "codex",
      mode: "run",
      prompt: `Review local changes ${index + 1}`,
      summary: `Result ${index + 1}`,
      status: "succeeded",
      parentTaskId: null,
      createdAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
      updatedAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
    }));
    await page.route("**/rpc/tasks/list", (route) => {
      if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
      const { json: input } = route.request().postDataJSON() as { json: { before?: string } };
      const visible = tasks.filter(
        (task) => !input.before || `${task.createdAt}:${task.id}` < input.before,
      );
      return authResponse(route, { json: visible.slice(0, 1) });
    });
    await page.route("**/rpc/tasks/get", (route) => {
      if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
      const { json: input } = route.request().postDataJSON() as { json: { id: string } };
      return authResponse(route, {
        json: {
          task: tasks.find((task) => task.id === input.id),
          events: [],
          requests: [],
          activity: [],
        },
      });
    });
    await page.goto(
      desktop +
        "/tasks?" +
        new URLSearchParams({ scope: "remote", device: deviceId, project: projectId }),
    );
    const older = page.getByRole("button", { name: "Older sessions", exact: true });
    const newer = page.getByRole("button", { name: "Newer sessions", exact: true });
    await expect(page.getByRole("button", { name: /Review local changes 1/ })).toBeVisible();
    await expect(newer).toBeDisabled();
    await older.click();
    await expect(page.getByRole("button", { name: /Review local changes 2/ })).toBeVisible();
    await older.click();
    await page.getByRole("button", { name: /Review local changes 3/ }).click();
    await expect(page.getByText("Result 3", { exact: true })).toBeVisible();
    await expect(older).toBeDisabled();
    await capture(page, { path: test.info().outputPath("task-pagination.png"), fullPage: true });
    await newer.click();
    await expect(page.getByRole("button", { name: /Review local changes 2/ })).toBeVisible();
    await newer.click();
    await expect(page.getByRole("button", { name: /Review local changes 1/ })).toBeVisible();
    await expect(newer).toBeDisabled();
  },
);

registerTests();
