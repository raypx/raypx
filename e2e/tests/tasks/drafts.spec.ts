import { expect } from "@playwright/test";
import { test } from "../helpers/browser-fixture.js";
import { surfaces } from "../helpers/surfaces.js";
import { capture } from "../helpers/capture.js";
import { authResponse, signedInAccount, webShellFixture } from "../helpers/account-fixture.js";
import { selectOption } from "../helpers/select.js";
import type { AgentTask } from "@raypx/contracts/tasks";

for (const [surface, base] of surfaces) {
  test(
    `${surface} restores device-only task drafts and filters the real page overview`,
    { tag: `@${surface.toLowerCase()}` },
    async ({ page }) => {
      if (surface === "Web") await webShellFixture(page);
      await signedInAccount(page);
      const deviceId = crypto.randomUUID(),
        projectId = crypto.randomUUID();
      const tasks: AgentTask[] = (["waiting", "running", "succeeded"] as const).map(
        (status, index) => ({
          id: crypto.randomUUID(),
          deviceId,
          projectId,
          provider: "codex",
          mode: "run",
          prompt: [
            "Approve the migration",
            "Validate reconnect behavior",
            "Review completed changes",
          ][index]!,
          summary: status === "succeeded" ? "All changes validated." : "",
          status,
          parentTaskId: null,
          createdAt: new Date(Date.now() - index * 1000).toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );
      await page.route("**/rpc/tasks/list", (route) => {
        if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
        const { json } = route.request().postDataJSON() as { json: { before?: string } };
        return authResponse(route, { json: json.before ? [] : tasks });
      });
      await page.route("**/rpc/tasks/get", (route) => {
        if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
        const { json } = route.request().postDataJSON() as { json: { id: string } };
        return authResponse(route, {
          json: { task: tasks.find((task) => task.id === json.id), events: [], requests: [] },
        });
      });
      await page.route("**/rpc/devices/list", (route) =>
        authResponse(route, {
          json: [
            {
              id: deviceId,
              name: "Development Mac",
              online: true,
              revoked: false,
              platform: "darwin",
              appVersion: "0.1.0",
              epoch: 1,
              lastSeenAt: null,
              projects: [{ id: projectId, name: "Raypx", providers: ["codex"], dirty: false }],
              capabilities: [
                {
                  provider: "codex",
                  available: true,
                  version: "0.163.0",
                  reason: "ready",
                  inputModes: ["queue", "steer"],
                },
              ],
            },
          ],
        }),
      );
      await page.goto(base + "/tasks");
      if (surface === "Desktop")
        await page.getByRole("tab", { name: "Connected computers", exact: true }).click();
      const overview = page.getByRole("group", { name: "Tasks on this page", exact: true });
      await expect(overview.getByRole("button", { name: /^Needs you/ })).toContainText("1");
      await overview.getByRole("button", { name: /^In progress/ }).click();
      const list = page.getByRole("list", { name: "Agent tasks", exact: true });
      await expect(list.getByRole("button", { name: /Validate reconnect behavior/ })).toBeVisible();
      await expect(list.getByRole("button", { name: /Approve the migration/ })).toHaveCount(0);
      await overview.getByRole("button", { name: /^All/ }).click();
      await page.getByRole("button", { name: "New task", exact: true }).click();
      const form = page.getByRole("form", { name: "New task", exact: true });
      const editor = form.getByRole("textbox", { name: "What should the agent do?", exact: true });
      await editor.fill("Investigate wake and reconnect behavior");
      await selectOption(
        page,
        form.getByRole("combobox", { name: "Computer", exact: true }),
        deviceId,
      );
      await selectOption(
        page,
        form.getByRole("combobox", { name: "Project", exact: true }),
        projectId,
      );
      await selectOption(page, form.getByRole("combobox", { name: "Agent", exact: true }), "codex");
      await form.getByRole("button", { name: "Save draft", exact: true }).click();
      await expect(form.getByText("Draft saved on this device.", { exact: true })).toBeVisible();
      await page.reload();
      if (surface === "Desktop")
        await page.getByRole("tab", { name: "Connected computers", exact: true }).click();
      const drafts = page.getByRole("region", { name: "Drafts", exact: true });
      await drafts.getByRole("button", { name: "Drafts", exact: true }).click();
      await drafts
        .getByRole("button", { name: /^Investigate wake and reconnect behavior/ })
        .click();
      await expect(editor).toHaveValue("Investigate wake and reconnect behavior");
      await expect(form.getByRole("combobox", { name: "Project", exact: true })).toContainText(
        "Raypx",
      );
      await form.getByRole("button", { name: "New draft", exact: true }).click();
      await expect(editor).toHaveValue("");
      await form.getByRole("button", { name: /^Task options/ }).click();
      await list.getByRole("button", { name: /Approve the migration/ }).click();
      await page.getByRole("main").evaluate((element) => element.scrollTo(0, 0));
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1),
      ).toBe(true);
      await capture(page, {
        path: test.info().outputPath(`${surface.toLowerCase()}-task-workspace.png`),
        fullPage: true,
      });
      await page.setViewportSize({ width: surface === "Web" ? 390 : 800, height: 844 });
      await page.getByRole("button", { name: "Back to tasks", exact: true }).click();
      await list.getByRole("button", { name: /Validate reconnect behavior/ }).click();
      await expect(page.getByRole("region", { name: "Task details", exact: true })).toBeFocused();
      await expect(
        page.getByRole("heading", { name: "Validate reconnect behavior", exact: true }),
      ).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await capture(page, {
        path: test.info().outputPath(`${surface.toLowerCase()}-task-workspace-mobile.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Back to tasks", exact: true }).click();
      await expect(list.getByRole("button", { name: /Validate reconnect behavior/ })).toBeFocused();
      await expect(
        list.getByRole("button", { name: /Validate reconnect behavior/ }),
      ).toBeInViewport();
    },
  );
}
