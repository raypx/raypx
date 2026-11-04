import { expect } from "@playwright/test";
import { test } from "../../helpers/browser-fixture.js";
import { capture } from "../../helpers/capture.js";
import {
  authResponse,
  connectedProject,
  signedInAccount,
  webShellFixture,
} from "../../helpers/account-fixture.js";

/** Register the shared journey in the owning application's Playwright file. */
export function registerTests() {
  test(`virtual task list supports scrolling, keyboard access and page reset`, async ({
    page,
    surface,
    base,
  }) => {
    if (surface === "Web") await webShellFixture(page);
    await signedInAccount(page);
    const deviceId = crypto.randomUUID(),
      projectId = crypto.randomUUID();
    await connectedProject(page, deviceId, projectId);
    const tasks = Array.from({ length: 101 }, (_, index) => ({
      id: crypto.randomUUID(),
      deviceId,
      projectId,
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
    await page.goto(
      base +
        "/tasks?" +
        new URLSearchParams({
          ...(surface === "Desktop" ? { scope: "remote" } : {}),
          device: deviceId,
          project: projectId,
        }),
    );
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
    await page.getByRole("button", { name: "Older sessions", exact: true }).click();
    await expect(viewport.getByRole("button", { name: /^Virtual task 101:/ })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Older sessions", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Newer sessions", exact: true }).click();
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
              element.getBoundingClientRect().top >= previousRow.getBoundingClientRect().bottom - 1
            );
          }),
        ),
      )
      .toBe(true);
    await capture(page, {
      path: test.info().outputPath("virtual-task-list.png"),
      fullPage: true,
    });
  });
}
