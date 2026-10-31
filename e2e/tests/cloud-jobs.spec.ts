import { expect } from "@playwright/test";
import { test } from "./helpers/browser-fixture.js";

import type { AgentTask } from "@raypx/core/tasks";

import type { CloudJob, CloudJobCreateInput, CloudJobRun } from "@raypx/jobs";
import { authResponse, signedInAccount, webShellFixture } from "./helpers/account-fixture.js";
import { selectOption } from "./helpers/select.js";

for (const [surface, base] of [
  ["Web", "http://127.0.0.1:4173"],
  ["Desktop", "http://127.0.0.1:4174"],
] as const) {
  const path = surface === "Desktop" ? "/automations?scope=cloud" : "/automations";
  test(
    `${surface} saves an account schedule and opens its related task outside the loaded list`,
    { tag: `@${surface.toLowerCase()}` },
    async ({ page }) => {
      if (surface === "Web") await webShellFixture(page);
      await signedInAccount(page);
      const deviceId = crypto.randomUUID(),
        projectId = crypto.randomUUID();
      const time = new Date().toISOString();
      let job: CloudJob | undefined;
      let run: CloudJobRun | undefined;
      const creates: CloudJobCreateInput[] = [],
        taskReads: string[] = [];
      let executionCommands = 0;
      await page.routeWebSocket("**/relay", (socket) => {
        socket.onMessage((raw) => {
          const message = JSON.parse(String(raw));
          if (message.type === "auth")
            socket.send(JSON.stringify({ type: "ready", role: "viewer", protocolVersion: 4 }));
          else if (message.type === "ping") socket.send(JSON.stringify({ type: "pong" }));
          else if (message.type === "request") executionCommands++;
        });
      });
      await page.route("**/rpc/relay/ticket", (route) =>
        authResponse(route, {
          json: {
            token: "browser-fixture-only",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }),
      );
      await page.route("**/rpc/devices/list", (route) =>
        authResponse(route, {
          json: [
            {
              id: deviceId,
              name: "Scheduled workstation",
              platform: "darwin",
              appVersion: "0.1.0",
              epoch: 4,
              online: true,
              lastSeenAt: time,
              projects: [
                {
                  id: projectId,
                  name: "Scheduled repository",
                  dirty: false,
                  providers: ["codex", "claude"],
                },
              ],
              capabilities: [
                { provider: "codex", available: true, version: "fixture" },
                { provider: "claude", available: true, version: "fixture" },
              ],
            },
          ],
        }),
      );
      await page.route("**/rpc/jobs/list", (route) =>
        authResponse(route, { json: { enabled: true, jobs: job ? [job] : [] } }),
      );
      await page.route("**/rpc/jobs/create", (route) => {
        const input = route.request().postDataJSON().json as CloudJobCreateInput;
        creates.push(input);
        const { requestId, ...value } = input;
        job = {
          ...value,
          id: requestId,
          revision: 1,
          createdAt: time,
          updatedAt: time,
          nextRunAt: new Date(Date.now() + 3_600_000).toISOString(),
        };
        return authResponse(route, { json: job });
      });
      await page.route("**/rpc/jobs/history", (route) =>
        authResponse(route, { json: run ? [run] : [] }),
      );
      await page.route("**/rpc/jobs/run", (route) => {
        const { requestId } = route.request().postDataJSON().json as { requestId: string };
        run = {
          id: requestId,
          taskId: requestId,
          jobId: job!.id,
          jobRevision: 1,
          action: job!.action,
          trigger: "manual",
          scheduledFor: time,
          startedAt: time,
          finishedAt: null,
          status: "running",
          code: null,
          sync: null,
        };
        return authResponse(route, { json: run });
      });
      await page.route("**/rpc/tasks/list", (route) => authResponse(route, { json: [] }));
      await page.route("**/rpc/tasks/get", (route) => {
        const { id } = route.request().postDataJSON().json as { id: string };
        taskReads.push(id);
        const task: AgentTask = {
          id,
          deviceId,
          projectId,
          provider: "claude",
          mode: "run",
          prompt: "Run the scheduled repository checks",
          status: "succeeded",
          summary: "Scheduled execution is visible through its task link.",
          parentTaskId: null,
          createdAt: time,
          updatedAt: time,
        };
        return authResponse(route, { json: { task, events: [], requests: [], activity: [] } });
      });
      await page.goto(base + path);
      await expect(
        page.getByRole("heading", { name: "Cloud automations", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "New cloud automation", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Name", exact: true })
        .fill("Daily repository checks");
      await page.getByRole("textbox", { name: "Time zone", exact: true }).fill("Asia/Singapore");
      await page.getByRole("radio", { name: "Create an agent task", exact: true }).click();
      await selectOption(
        page,
        page.getByRole("combobox", { name: "Computer", exact: true }),
        `${deviceId}:4`,
      );
      await selectOption(
        page,
        page.getByRole("combobox", { name: "Project", exact: true }),
        projectId,
      );
      await selectOption(
        page,
        page.getByRole("combobox", { name: "Agent", exact: true }),
        "claude",
      );
      await page
        .getByRole("textbox", { name: "Task instructions", exact: true })
        .fill("Run the scheduled repository checks");
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Daily repository checks", exact: true }),
      ).toBeVisible();
      expect(creates).toHaveLength(1);
      expect(creates[0]).toMatchObject({
        timezone: "Asia/Singapore",
        action: { type: "agent.run", deviceId, epoch: 4, projectId, provider: "claude" },
      });
      expect(creates[0]!.requestId).toMatch(/^[0-9a-f-]{36}$/);
      await page.getByRole("button", { name: "Run now", exact: true }).click();
      await page.getByRole("button", { name: /Manual run/ }).click();
      await page.getByRole("link", { name: "Open related agent task", exact: true }).click();
      await expect(
        page.getByText("Scheduled execution is visible through its task link.", { exact: true }),
      ).toBeVisible();
      expect(taskReads).toContain(run!.taskId);
      expect(new URL(page.url()).searchParams.get("taskId")).toBe(run!.taskId);
      expect(executionCommands).toBe(0);
    },
  );
}
