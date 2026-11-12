import { expect } from "@playwright/test";
import { test } from "../../helpers/browser-fixture.js";
import { capture } from "../../helpers/capture.js";
import { authResponse, signedInAccount, webShellFixture } from "../../helpers/account-fixture.js";
import { selectOption } from "../../helpers/select.js";

import type { AgentTask } from "@raypx/core/tasks";

/** Register the shared journey in the owning application's Playwright file. */
export function registerTests() {
  test(`restores device-only task drafts and filters the real page overview`, async ({
    page,
    surface,
    base,
  }) => {
    if (surface === "Web") await webShellFixture(page);
    await signedInAccount(page);
    const deviceId = crypto.randomUUID(),
      projectId = crypto.randomUUID();
    const attachmentText = "Reconnect notes\n测试";
    const attachment = { id: crypto.randomUUID(), revision: 1, attachment: "reconnect.md" };
    const uploads: unknown[] = [];
    await page.route("**/rpc/attachments/status", (route) =>
      authResponse(route, { json: { enabled: true } }),
    );
    await page.route("**/rpc/attachments/upload", (route) => {
      if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
      uploads.push(route.request().postDataJSON()?.json);
      return authResponse(route, { json: attachment });
    });
    await page.route("**/rpc/memory/resolve", (route) =>
      authResponse(route, {
        json: {
          capturedAt: new Date().toISOString(),
          sources: [
            {
              id: attachment.id,
              revision: attachment.revision,
              name: attachment.attachment,
              kind: "attachment",
              scope: "account",
              project: { deviceId, projectId },
              content: attachmentText,
            },
          ],
        },
      }),
    );
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
        json: {
          task: tasks.find((task) => task.id === json.id),
          events: [],
          requests: [],
          activity: [],
        },
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
                definition: {
                  version: 1 as const,
                  runtime: "process" as const,
                  modes: ["plan" as const, "run" as const],
                  approvals: true,
                  modelSelection: false,
                },
                inputModes: ["queue", "steer"],
              },
            ],
          },
        ],
      }),
    );
    await page.goto(
      base +
        "/tasks?" +
        new URLSearchParams({
          ...(surface === "Desktop" ? { scope: "remote" } : {}),
          device: deviceId,
          project: projectId,
        }),
    );
    const tools = page.getByRole("navigation", { name: "Project tools", exact: true });
    await expect(tools.getByRole("link", { name: "Sessions", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const overview = page.getByRole("group", { name: "Sessions on this page", exact: true });
    await expect(overview.getByRole("button", { name: /^Needs you/ })).toContainText("1");
    await overview.getByRole("button", { name: /^In progress/ }).click();
    const list = page.getByRole("list", { name: "Agent sessions", exact: true });
    await expect(list.getByRole("button", { name: /Validate reconnect behavior/ })).toBeVisible();
    await expect(list.getByRole("button", { name: /Approve the migration/ })).toHaveCount(0);
    await overview.getByRole("button", { name: /^All/ }).click();
    await page.getByRole("button", { name: "New session", exact: true }).click();
    const form = page.getByRole("form", { name: "New session", exact: true });
    const editor = form.getByRole("textbox", { name: "What should the agent do?", exact: true });
    await editor.fill("Investigate wake and reconnect behavior");
    const chooser = page.waitForEvent("filechooser");
    await form.getByRole("button", { name: "Attach text file", exact: true }).click();
    await (
      await chooser
    ).setFiles({
      name: attachment.attachment,
      mimeType: "text/markdown",
      buffer: Buffer.from(attachmentText),
    });
    const attachments = form.getByRole("list", { name: "Attachments", exact: true });
    await expect(attachments.getByText(attachment.attachment, { exact: true })).toBeVisible();
    expect(uploads).toEqual([
      {
        deviceId,
        projectId,
        name: attachment.attachment,
        data: Buffer.from(attachmentText).toString("base64"),
      },
    ]);
    await selectOption(page, form.getByRole("combobox", { name: "Agent", exact: true }), "codex");
    await form.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.reload();
    const drafts = page.getByRole("region", { name: "Drafts", exact: true });
    await drafts.getByRole("button", { name: "Drafts", exact: true }).click();
    await drafts.getByRole("button", { name: /^Investigate wake and reconnect behavior/ }).click();
    await expect(editor).toHaveValue("Investigate wake and reconnect behavior");
    await expect(attachments.getByText(attachment.attachment, { exact: true })).toBeVisible();
    expect(uploads).toHaveLength(1);
    await expect(page.getByRole("heading", { name: "Raypx", exact: true })).toBeVisible();
    await expect(form.getByRole("combobox", { name: "Project", exact: true })).toHaveCount(0);
    await form.getByRole("button", { name: "New draft", exact: true }).click();
    await expect(editor).toHaveValue("");
    await expect(attachments).toHaveCount(0);
    await form.getByRole("button", { name: /^Session options/ }).click();
    await page.getByRole("main").evaluate((element) => element.scrollTo(0, 0));
    await capture(page, {
      path: test.info().outputPath(`${surface.toLowerCase()}-session-editor.png`),
      fullPage: true,
    });
    await list.getByRole("button", { name: /Approve the migration/ }).click();
    await page.getByRole("main").evaluate((element) => element.scrollTo(0, 0));
    await capture(page, {
      path: test.info().outputPath(`${surface.toLowerCase()}-task-workspace.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: surface === "Web" ? 390 : 800, height: 844 });
    await page.getByRole("button", { name: "Back to sessions", exact: true }).click();
    await list.getByRole("button", { name: /Validate reconnect behavior/ }).click();
    await expect(page.getByRole("region", { name: "Session details", exact: true })).toBeFocused();
    await expect(
      page.getByRole("heading", { name: "Validate reconnect behavior", exact: true }),
    ).toBeVisible();
    await capture(page, {
      path: test.info().outputPath(`${surface.toLowerCase()}-task-workspace-mobile.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Back to sessions", exact: true }).click();
    await expect(list.getByRole("button", { name: /Validate reconnect behavior/ })).toBeFocused();
    await tools.getByRole("link", { name: "References", exact: true }).press("Enter");
    await expect(page).toHaveURL(
      (url) => url.pathname === "/memory" && url.searchParams.get("project") === projectId,
    );
  });
}
