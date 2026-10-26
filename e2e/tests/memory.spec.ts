import { capture } from "./helpers/capture.js";
import { expect, test } from "@playwright/test";
import type {
  ContextDocument,
  ContextDocumentInput,
  ContextVersion,
} from "@raypx/contracts/memory";
import type { AgentTask, RelayClientFrame } from "@raypx/contracts/tasks";
import { authResponse, signedInDesktop, webShellFixture } from "./helpers/account-fixture.js";
import { selectOption } from "./helpers/select.js";

for (const [surface, base] of [
  ["Web", "http://127.0.0.1:4173"],
  ["Desktop", "http://127.0.0.1:4174"],
] as const) {
  const memoryPath = surface === "Desktop" ? "/memory?scope=account" : "/memory";
  const tasksPath = surface === "Desktop" ? "/tasks?scope=remote" : "/tasks";
  test(
    `${surface} gates account references without reading them before login`,
    { tag: `@${surface.toLowerCase()}` },
    async ({ page }) => {
      await page.route("**/api/auth/get-session**", (route) => authResponse(route, null));
      const reads: string[] = [];
      page.on("request", (request) => {
        if (/\/rpc\/memory\//.test(request.url())) reads.push(request.url());
      });
      await page.goto(base + memoryPath);
      await expect(page.getByRole("link", { name: "Sign in", exact: true }).last()).toBeVisible();
      expect(reads).toEqual([]);
      await page.getByRole("link", { name: "Sign in", exact: true }).last().click();
      await expect(page).toHaveURL(/\/login\?returnTo=/);
      expect(new URL(page.url()).searchParams.get("returnTo")).toBe(memoryPath);
    },
  );

  test(
    `${surface} versions a template and preserves its captured task context`,
    { tag: [`@${surface.toLowerCase()}`, "@smoke"] },
    async ({ page }) => {
      if (surface === "Web") await webShellFixture(page);
      await signedInDesktop(page);
      const deviceId = crypto.randomUUID(),
        projectId = crypto.randomUUID(),
        time = new Date().toISOString();
      const original = "Run the project tests and explain the result.";
      let document: ContextDocument | undefined, task: AgentTask | undefined;
      const versions: ContextVersion[] = [];
      let submitted: Extract<RelayClientFrame, { type: "request" }> | undefined;
      const remember = (reason: ContextVersion["reason"], restoredFrom?: number) =>
        versions.unshift({ ...document!, reason, ...(restoredFrom ? { restoredFrom } : {}) });
      await page.route("**/rpc/devices/list", (route) =>
        authResponse(route, {
          json: [
            {
              id: deviceId,
              name: "Context workstation",
              platform: "darwin",
              appVersion: "0.1.0",
              epoch: 1,
              revoked: false,
              online: true,
              lastSeenAt: time,
              projects: [
                { id: projectId, name: "Context project", dirty: false, providers: ["codex"] },
              ],
              capabilities: [
                { provider: "codex", available: true, reason: "ready", version: "fixture" },
              ],
            },
          ],
        }),
      );
      await page.route("**/rpc/memory/list", (route) =>
        authResponse(route, { json: document ? [document] : [] }),
      );
      await page.route("**/rpc/memory/get", (route) => authResponse(route, { json: document }));
      await page.route("**/rpc/memory/create", (route) => {
        const input = route.request().postDataJSON().json as {
          requestId: string;
          document: ContextDocumentInput;
        };
        document = {
          ...input.document,
          id: input.requestId,
          revision: 1,
          archived: false,
          createdAt: time,
          updatedAt: time,
        };
        remember("created");
        return authResponse(route, { json: document });
      });
      await page.route("**/rpc/memory/update", (route) => {
        const input = route.request().postDataJSON().json as {
          revision: number;
          document: ContextDocumentInput;
        };
        expect(input.revision).toBe(document!.revision);
        document = { ...document!, ...input.document, revision: input.revision + 1 };
        remember("updated");
        return authResponse(route, { json: document });
      });
      await page.route("**/rpc/memory/history", (route) => {
        const input = route.request().postDataJSON().json as { before?: number; limit: number };
        return authResponse(route, {
          json: versions
            .filter((v) => !input.before || v.revision < input.before)
            .slice(0, input.limit),
        });
      });
      await page.route("**/rpc/memory/restore", (route) => {
        const input = route.request().postDataJSON().json as { revision: number; version: number };
        const selected = versions.find((v) => v.revision === input.version)!;
        const { reason: _reason, restoredFrom: _from, ...value } = selected;
        document = { ...value, revision: input.revision + 1 };
        remember("restored", input.version);
        return authResponse(route, { json: document });
      });
      await page.route("**/rpc/jobs/list", (route) =>
        authResponse(route, { json: { enabled: true, jobs: [] } }),
      );
      await page.route("**/rpc/memory/archive", (route) => {
        const input = route.request().postDataJSON().json as {
          revision: number;
          archived: boolean;
        };
        expect(input.revision).toBe(document!.revision);
        document = { ...document!, revision: input.revision + 1, archived: input.archived };
        remember(input.archived ? "archived" : "unarchived");
        return authResponse(route, { json: document });
      });
      await page.route("**/rpc/memory/delete", (route) => {
        const input = route.request().postDataJSON().json as { id: string; revision: number };
        expect(input).toEqual({ id: document!.id, revision: document!.revision });
        expect(document!.archived).toBe(true);
        document = undefined;
        versions.splice(0);
        return authResponse(route, { json: { deleted: true } });
      });
      await page.route("**/rpc/tasks/list", (route) =>
        authResponse(route, { json: task ? [task] : [] }),
      );
      await page.route("**/rpc/tasks/get", (route) =>
        authResponse(route, { json: { task, events: [], requests: [], activity: [] } }),
      );
      await page.route("**/rpc/relay/ticket", (route) =>
        authResponse(route, {
          json: { token: "fixture-only", expiresAt: new Date(Date.now() + 60000).toISOString() },
        }),
      );
      await page.routeWebSocket(/\/relay(?:\?|$)/, (socket) =>
        socket.onMessage((raw) => {
          const frame = JSON.parse(String(raw)) as RelayClientFrame;
          if (frame.type === "auth")
            socket.send(
              JSON.stringify({
                type: "ready",
                role: "viewer",
                protocolVersion: 3,
                contextSupported: true,
              }),
            );
          if (frame.type !== "request" || frame.request.method !== "tasks.create") return;
          submitted = frame;
          const { contextSelection, ...input } = frame.request.input;
          expect(contextSelection).toEqual({ sources: [{ id: document!.id, revision: 3 }] });
          task = {
            ...input,
            parentTaskId: null,
            status: "succeeded",
            summary: "Template applied",
            createdAt: time,
            updatedAt: time,
            context: {
              capturedAt: time,
              sources: [
                {
                  id: document!.id,
                  revision: 3,
                  kind: document!.kind,
                  name: document!.name,
                  content: document!.content,
                  scope: "account",
                  project: document!.project,
                },
              ],
            },
          };
          socket.send(
            JSON.stringify({ type: "result", id: frame.id, result: { ok: true, value: task } }),
          );
        }),
      );

      await page.goto(base + memoryPath);
      await page.getByRole("button", { name: "New reference", exact: true }).click();
      await selectOption(
        page,
        page.getByRole("combobox", { name: "Reference type", exact: true }).first(),
        "template",
      );
      await page
        .getByRole("textbox", { name: "Name", exact: true })
        .fill("Repository check template");
      await page.getByRole("textbox", { name: "Reference content", exact: true }).fill(original);
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Repository check template", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Edit: Repository check template", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Reference content", exact: true })
        .fill("Check a newer workflow.");
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await page.getByRole("button", { name: "Version timeline", exact: true }).click();
      await page.getByRole("button", { name: /^Revision 1\s*Created/ }).click();
      await page.getByRole("button", { name: "Restore revision 1", exact: true }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Restore version", exact: true })
        .click();
      await expect.poll(() => document?.revision).toBe(3);
      await expect(page.getByRole("alertdialog")).toBeHidden();
      await capture(page, {
        path: test.info().outputPath(`${surface.toLowerCase()}-memory-timeline.png`),
        fullPage: true,
      });

      await page.goto(base + tasksPath);
      const composer = page.getByRole("form", { name: "New task", exact: true });
      if (!(await composer.isVisible()))
        await page.getByRole("button", { name: "New task", exact: true }).click();
      if (!(await page.getByRole("combobox", { name: "Computer", exact: true }).isVisible()))
        await page.getByRole("button", { name: /Task options/ }).click();
      await selectOption(
        page,
        page.getByRole("combobox", { name: "Computer", exact: true }),
        deviceId,
      );
      await selectOption(
        page,
        page.getByRole("combobox", { name: "Project", exact: true }),
        projectId,
      );
      await selectOption(page, page.getByRole("combobox", { name: "Agent", exact: true }), "codex");
      await page
        .getByRole("textbox", { name: "What should the agent do?", exact: true })
        .fill("Check this repository.");
      await page.getByRole("button", { name: /Memory and templates \(0\/8\)/ }).click();
      await page.getByRole("checkbox", { name: /Repository check template/ }).check();
      await expect(page.getByLabel("Reference and task budget")).toBeVisible();
      await page
        .getByRole("textbox", { name: "What should the agent do?", exact: true })
        .fill("x".repeat(32_000));
      await expect(page.getByText(/Over the limit by/)).toBeVisible();
      await expect(composer.getByRole("button", { name: "Send task", exact: true })).toBeDisabled();
      expect(submitted).toBeUndefined();
      const viewport = page.viewportSize()!;
      await page.setViewportSize({ width: surface === "Web" ? 390 : 800, height: 844 });
      await expect
        .poll(() =>
          page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth + 1),
        )
        .toBe(true);
      await page.getByLabel("Reference and task budget").scrollIntoViewIfNeeded();
      await capture(page, {
        path: test.info().outputPath(`${surface.toLowerCase()}-context-budget.png`),
        fullPage: true,
      });
      await page.setViewportSize(viewport);
      await page
        .getByRole("textbox", { name: "What should the agent do?", exact: true })
        .fill("Check this repository.");
      await composer.getByRole("button", { name: "Send task", exact: true }).click();
      const snapshot = page.getByRole("region", { name: "Task context", exact: true });
      await expect(snapshot).toBeVisible();
      await snapshot.getByRole("button", { name: /Repository check template/ }).click();
      await expect(snapshot.getByText(original, { exact: true })).toBeVisible();
      expect(submitted).toBeDefined();

      await page.goto(base + memoryPath);
      await page
        .getByRole("button", { name: "Edit: Repository check template", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Reference content", exact: true })
        .fill("Changed after the task was created.");
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect.poll(() => document?.revision).toBe(4);
      await page
        .getByRole("button", { name: "Archive: Repository check template", exact: true })
        .click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Archive", exact: true })
        .click();
      await page.getByRole("checkbox", { name: "Include archived", exact: true }).check();
      await page.setViewportSize({ width: surface === "Web" ? 390 : 800, height: 844 });
      await page
        .getByRole("button", { name: "Permanently delete Repository check template", exact: true })
        .click();
      await expect(page.getByRole("alertdialog")).toContainText("all its versions");
      await expect(page.getByRole("alertdialog")).toHaveCSS("opacity", "1");
      await capture(page, {
        path: test.info().outputPath(`${surface.toLowerCase()}-memory-delete.png`),
        fullPage: true,
      });
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete permanently", exact: true })
        .click();
      await expect.poll(() => document).toBeUndefined();
      await expect(page.getByText(/No references match/)).toBeVisible();
      await page.goto(
        `${base}${tasksPath}${tasksPath.includes("?") ? "&" : "?"}taskId=${task!.id}`,
      );
      const retained = page.getByRole("region", { name: "Task context", exact: true });
      await retained.getByRole("button", { name: /Repository check template/ }).click();
      await expect(retained.getByText(original, { exact: true })).toBeVisible();
      await expect(retained).toContainText("Revision 3");
      await expect(retained).not.toContainText("Changed after");
      await page.setViewportSize({ width: surface === "Web" ? 390 : 800, height: 844 });
      expect(
        await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await capture(page, {
        path: test.info().outputPath(`${surface.toLowerCase()}-task-context.png`),
        fullPage: true,
      });
    },
  );
}
