import { expect } from "@playwright/test";
import { test } from "../helpers/browser-fixture.js";
import { desktop, surfaces } from "../helpers/surfaces.js";
import { capture } from "../helpers/capture.js";
import { authResponse, signedInAccount, webShellFixture } from "../helpers/account-fixture.js";

test(
  "Desktop defaults to local tasks and opens remote tasks through an accessible scope switch",
  { tag: "@desktop" },
  async ({ page }) => {
    await signedInAccount(page);
    let remoteReads = 0;
    await page.route("**/rpc/tasks/list", async (route) => {
      remoteReads++;
      await authResponse(route, { json: [] });
    });
    await page.goto(desktop + "/tasks");
    const local = page.getByRole("tab", { name: "This computer", exact: true });
    await expect(local).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByText("Open the desktop app to use local tools.", { exact: true }),
    ).toBeVisible();
    expect(remoteReads).toBe(0);
    await capture(page, {
      path: test.info().outputPath("local-tasks-preview.png"),
      fullPage: true,
    });
    await local.focus();
    await page.keyboard.press("ArrowRight");
    const remote = page.getByRole("tab", { name: "Connected computers", exact: true });
    await expect(remote).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(remote).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: "No agent tasks yet", exact: true }),
    ).toBeVisible();
    expect(remoteReads).toBeGreaterThan(0);
    await page.goto(desktop + "/settings");
    await page.getByRole("radio", { name: "Dark", exact: true }).check();
    await page.getByRole("combobox", { name: "Language", exact: true }).click();
    await page.getByRole("option", { name: "简体中文", exact: true }).click();
    await page.goto(desktop + "/tasks");
    await expect(page.getByRole("tab", { name: "此电脑", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
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
    const tasks = Array.from({ length: 3 }, (_, index) => ({
      id: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
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
    await page.goto(desktop + "/tasks");
    await page.getByRole("tab", { name: "Connected computers", exact: true }).click();
    const older = page.getByRole("button", { name: "Older tasks", exact: true });
    const newer = page.getByRole("button", { name: "Newer tasks", exact: true });
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

for (const [surface, base] of surfaces) {
  test(
    `${surface} virtual task list supports scrolling, keyboard access and page reset`,
    { tag: `@${surface.toLowerCase()}` },
    async ({ page }) => {
      if (surface === "Web") await webShellFixture(page);
      await signedInAccount(page);
      const tasks = Array.from({ length: 101 }, (_, index) => ({
        id: crypto.randomUUID(),
        deviceId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        provider: "codex",
        mode: "run",
        prompt: `Virtual task ${index + 1}: ${index % 2 ? "Check the result" : "检查项目的构建结果和任务执行状态。".repeat(12)}`,
        summary: `Virtual result ${index + 1}`,
        status: "succeeded",
        parentTaskId: null,
        createdAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
        updatedAt: new Date(1_700_000_000_000 - index * 1000).toISOString(),
      }));
      await page.route("**/rpc/tasks/list", (route) => {
        if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
        const { json: input } = route.request().postDataJSON() as {
          json: { before?: string; limit: number };
        };
        return authResponse(route, {
          json: tasks
            .filter((task) => !input.before || `${task.createdAt}:${task.id}` < input.before)
            .slice(0, input.limit),
        });
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
      await page.goto(base + "/tasks");
      if (surface === "Desktop")
        await page.getByRole("tab", { name: "Connected computers", exact: true }).click();
      const viewport = page.locator("[data-task-list]");
      const rows = viewport.getByRole("listitem");
      const first = viewport.getByRole("button", { name: /^Virtual task 1:/ });
      const last = viewport.getByRole("button", { name: /^Virtual task 100:/ });
      await expect(first).toBeVisible();
      await expect.poll(() => rows.count()).toBeLessThan(30);
      await expect(last).toHaveCount(0);
      await viewport.scrollIntoViewIfNeeded();
      await viewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(last).toBeInViewport();
      await last.click();
      await expect(page.getByText("Virtual result 100", { exact: true })).toBeVisible();
      await expect(last).toHaveAttribute("aria-pressed", "true");
      await last.press("Home");
      await expect(first).toBeFocused();
      await expect(first).toBeInViewport();
      await first.press("End");
      await expect(last).toBeFocused();
      await expect(last).toBeInViewport();
      await last.press("ArrowUp");
      const previous = viewport.getByRole("button", { name: /^Virtual task 99:/ });
      await expect(previous).toBeFocused();
      await expect(previous).toBeInViewport();
      // A pointer scroll must not unmount the row that still owns keyboard focus.
      await viewport.evaluate((element) => {
        element.scrollTop = 0;
      });
      await expect(first).toBeInViewport();
      await expect(previous).toBeFocused();
      await expect.poll(() => rows.count()).toBeLessThan(30);
      await page.getByRole("button", { name: "Older tasks", exact: true }).click();
      await expect(viewport.getByRole("button", { name: /^Virtual task 101:/ })).toBeInViewport();
      await expect(page.getByRole("button", { name: "Older tasks", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Newer tasks", exact: true }).click();
      await expect(first).toBeInViewport();
      if (surface === "Web") await page.setViewportSize({ width: 390, height: 844 });
      await expect
        .poll(() =>
          rows.evaluateAll((elements) =>
            elements.every((element, index) => {
              const previousRow = elements[index - 1];
              return (
                !previousRow ||
                Number(element.getAttribute("data-index")) !==
                  Number(previousRow.getAttribute("data-index")) + 1 ||
                element.getBoundingClientRect().top >=
                  previousRow.getBoundingClientRect().bottom - 1
              );
            }),
          ),
        )
        .toBe(true);
      await capture(page, {
        path: test.info().outputPath("virtual-task-list.png"),
        fullPage: true,
      });
    },
  );
}
