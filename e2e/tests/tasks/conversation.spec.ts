import { expect } from "@playwright/test";
import { test } from "../helpers/browser-fixture.js";
import { surfaces } from "../helpers/surfaces.js";
import { capture } from "../helpers/capture.js";
import { authResponse, signedInAccount, webShellFixture } from "../helpers/account-fixture.js";
import { selectOption } from "../helpers/select.js";
import { expectViewportShell } from "../helpers/layout.js";
import type {
  AgentTask,
  HumanRequest,
  TaskActivity,
  RelayClientFrame,
} from "@raypx/contracts/tasks";

for (const [surface, base] of surfaces) {
  test(
    `${surface} shows conversation, Diff approvals and sends queued and immediate instructions`,
    { tag: [`@${surface.toLowerCase()}`, "@smoke"] },
    async ({ page }) => {
      if (surface === "Web") await webShellFixture(page);
      await signedInAccount(page);
      const deviceId = crypto.randomUUID(),
        projectId = crypto.randomUUID(),
        now = new Date().toISOString();
      const task: AgentTask = {
        id: crypto.randomUUID(),
        deviceId,
        projectId,
        provider: "codex",
        mode: "run",
        prompt: "Improve task delivery reliability",
        summary: "",
        status: "waiting",
        parentTaskId: null,
        createdAt: now,
        updatedAt: now,
      };
      let approval: HumanRequest = {
        id: crypto.randomUUID(),
        taskId: task.id,
        kind: "permission",
        title: "Update task delivery",
        body: JSON.stringify({
          changes: [
            {
              path: "src/delivery.ts",
              kind: { type: "update" },
              diff: "@@ -12,2 +12,3 @@\n-send(input);\n+await persist(input);\n+await sendOnce(input);\n return receipt;",
            },
          ],
        }),
        questions: [],
        status: "pending",
        decision: null,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
      const activity: TaskActivity[] = [
        {
          id: crypto.randomUUID(),
          taskId: task.id,
          order: 1,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          kind: "message",
          text: "## Delivery plan\n\nPersist each instruction before sending it.\n\n- Keep one active turn\n- Resume the same session\n\n```ts\nawait persist(input);\nawait sendOnce(input);\n```\n\n**Ready for your approval.**",
          status: "complete",
          truncated: false,
        },
        {
          id: crypto.randomUUID(),
          taskId: task.id,
          order: 2,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          kind: "tool",
          name: "Edit",
          status: "running",
        },
        {
          id: crypto.randomUUID(),
          taskId: task.id,
          order: 3,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          kind: "usage",
          inputTokens: 1200,
          outputTokens: 180,
          cachedInputTokens: 800,
          cacheWriteTokens: 0,
          durationMs: 3000,
        },
      ];
      const inputs: string[] = [];
      await page.route("**/rpc/tasks/list", (route) => {
        const before = route.request().postDataJSON()?.json?.before;
        return authResponse(route, { json: before ? [] : [task] });
      });
      await page.route("**/rpc/tasks/get", (route) =>
        authResponse(route, { json: { task, activity, events: [], requests: [approval] } }),
      );
      await page.route("**/rpc/devices/list", (route) =>
        authResponse(route, {
          json: [
            {
              id: deviceId,
              name: "Development Mac",
              platform: "darwin",
              appVersion: "0.1.0",
              epoch: 1,
              revoked: false,
              lastSeenAt: now,
              online: true,
              projects: [{ id: projectId, name: "Raypx", providers: ["codex"], dirty: false }],
              capabilities: [
                {
                  provider: "codex",
                  available: true,
                  version: "0.163.0",
                  reason: "ready",
                  inputModes: ["steer", "queue"],
                },
              ],
            },
          ],
        }),
      );
      await page.route("**/rpc/relay/ticket", (route) =>
        authResponse(route, {
          json: {
            token: "browser-fixture-token-000000000000000",
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          },
        }),
      );
      await page.routeWebSocket(/\/relay(?:\?|$)/, (socket) => {
        socket.onMessage((raw) => {
          const frame = JSON.parse(String(raw)) as RelayClientFrame;
          if (frame.type === "auth")
            socket.send(JSON.stringify({ type: "ready", protocolVersion: 2, role: "viewer" }));
          if (frame.type !== "request") return;
          let value: unknown;
          if (frame.request.method === "tasks.input") {
            const input = frame.request.input;
            inputs.push(input.mode);
            value = {
              id: input.id,
              taskId: task.id,
              kind: "input",
              mode: input.mode,
              text: input.prompt,
              status: "queued",
              order: activity.length + 1,
              revision: 1,
              createdAt: now,
              updatedAt: now,
            } satisfies TaskActivity;
            activity.push(value as TaskActivity);
          } else if (frame.request.method === "approvals.decide") {
            approval = { ...approval, status: "applied", decision: frame.request.input.decision };
            task.status = "running";
            value = approval;
          }
          socket.send(
            JSON.stringify({ type: "result", id: frame.id, result: { ok: true, value } }),
          );
        });
      });
      await page.goto(base + "/tasks");
      if (surface === "Desktop")
        await page.getByRole("tab", { name: "Connected computers", exact: true }).click();
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      const agentFilter = page
        .getByRole("region", { name: "Task history", exact: true })
        .getByRole("combobox", { name: "Agent", exact: true });
      await selectOption(page, agentFilter, "claude");
      await expect(
        page.getByRole("button", { name: /Improve task delivery reliability/ }),
      ).toHaveCount(0);
      await selectOption(page, agentFilter, "");
      await page.getByRole("button", { name: /Improve task delivery reliability/ }).click();
      await expect(
        page.getByRole("cell", { name: "await persist(input);", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: "Delivery plan", exact: true })).toBeVisible();
      const activityToggle = page.getByRole("button", { name: "Activity", exact: true });
      await activityToggle.click();
      await expect(activityToggle).toHaveAttribute("aria-expanded", "true");
      await activityToggle.press("Space");
      await expect(activityToggle).toHaveAttribute("aria-expanded", "false");
      const composer = page.getByRole("textbox", { name: "Add an instruction", exact: true });
      await composer.fill("Validate the queue after this turn.");
      await expect(page.getByRole("button", { name: "Send now", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Queue next turn", exact: true }).click();
      await expect(composer).toHaveValue("");
      await page.getByRole("button", { name: "Allow once", exact: true }).click();
      await composer.fill("Also handle a lost receipt.");
      await page.getByRole("button", { name: "Send now", exact: true }).click();
      await expect(composer).toHaveValue("");
      expect(inputs).toEqual(["queue", "steer"]);
      await expectViewportShell(page);
      await capture(page, {
        path: test.info().outputPath(`${surface.toLowerCase()}-conversation.png`),
        fullPage: true,
      });
      // The native Desktop shell has an 800px minimum window width.
      await page.setViewportSize({ width: surface === "Web" ? 390 : 800, height: 844 });
      await expectViewportShell(page);
      await capture(page, {
        path: test.info().outputPath(`${surface.toLowerCase()}-conversation-mobile.png`),
        fullPage: true,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await page.getByRole("main").evaluate((element) => element.scrollTo(0, element.scrollHeight));
      await page.getByRole("link", { name: "Settings", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Make it yours", exact: true })).toBeVisible();
      await expect
        .poll(() => page.getByRole("main").evaluate((element) => element.scrollTop))
        .toBe(0);
      await page.goBack();
      if (surface === "Desktop")
        await page.getByRole("tab", { name: "Connected computers", exact: true }).click();
      await expect(page.getByRole("button", { name: "New task", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "New task", exact: true }).click();
      const createForm = page
        .getByRole("textbox", { name: "What should the agent do?", exact: true })
        .locator("xpath=ancestor::form[1]");
      await selectOption(
        page,
        createForm.getByRole("combobox", { name: "Computer", exact: true }),
        deviceId,
      );
      await selectOption(
        page,
        createForm.getByRole("combobox", { name: "Project", exact: true }),
        projectId,
      );
      await selectOption(
        page,
        createForm.getByRole("combobox", { name: "Agent", exact: true }),
        "codex",
      );
      await selectOption(
        page,
        createForm.getByRole("combobox", { name: "Execution", exact: true }),
        "plan",
      );
      await expect(
        createForm.getByRole("combobox", { name: "Project", exact: true }),
      ).toContainText("Raypx");
      await expect(
        createForm.getByRole("combobox", { name: "Execution", exact: true }),
      ).toContainText("Analyze, then ask before implementing");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      if (surface === "Web") {
        await page.goto(base + "/settings");
        await page.getByText("Dark", { exact: true }).click();
        await expect(page.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        await page.getByRole("combobox", { name: "Language", exact: true }).click();
        await page.getByRole("option", { name: "简体中文", exact: true }).click();
        await page.goto(base + "/tasks");
        await page.getByRole("button", { name: /Improve task delivery reliability/ }).click();
        await expect(page.getByRole("heading", { name: "会话", exact: true })).toBeVisible();
        await expectViewportShell(page);
        await capture(page, {
          path: test.info().outputPath("web-conversation-dark-zh.png"),
          fullPage: true,
        });
        await page
          .getByRole("main")
          .evaluate((element) => element.scrollTo(0, element.scrollHeight));
        await capture(page, {
          path: test.info().outputPath("web-conversation-dark-zh-bottom.png"),
          fullPage: true,
        });
      }
    },
  );
}

// Browser acceptance isolates HTTP responses only. It never creates native IPC.
// Real registration, verification, reset and revocation run in API's PostgreSQL gate.
