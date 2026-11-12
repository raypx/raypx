import { expect } from "@playwright/test";
import { test } from "../../helpers/browser-fixture.js";
import {
  authResponse,
  connectedProject,
  signedInAccount,
  webShellFixture,
} from "../../helpers/account-fixture.js";

import type { AgentTask, TaskActivity } from "@raypx/core/tasks";

/** Register the shared journey in the owning application's Playwright file. */
export function registerTests() {
  test(
    `conversation keeps virtual rows bounded and loaded full text reachable`,
    { tag: "@performance" },
    async ({ page, surface, base }) => {
      // Keep the regression sensitive to delayed measurement on slower CI hosts.
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      if (surface === "Web") await webShellFixture(page);
      await signedInAccount(page);
      const now = new Date().toISOString();
      const task: AgentTask = {
        id: crypto.randomUUID(),
        deviceId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        provider: "codex",
        mode: "run",
        prompt: "Conversation reading fixture",
        status: "running",
        summary: "",
        parentTaskId: null,
        createdAt: now,
        updatedAt: now,
      };
      const second = { ...task, id: crypto.randomUUID(), prompt: "Another conversation fixture" };
      const makeEntry = (order: number): TaskActivity => ({
        id: crypto.randomUUID(),
        taskId: task.id,
        order,
        revision: 1,
        kind: "message",
        text:
          `Conversation message ${order}. [Inspect this result](https://example.com/result/${order})` +
          (order % 29 === 0
            ? "\n\n```ts\nconst result = await inspect();\n```\n\n" +
              "A longer paragraph to measure. ".repeat(20)
            : ""),
        status: "complete",
        truncated: false,
        createdAt: now,
        updatedAt: now,
      });
      // The complete journey loads at most 200 messages, including history/gaps.
      const loaded = Array.from({ length: 100 }, (_, index) => makeEntry(index + 51));
      const older = Array.from({ length: 50 }, (_, index) => makeEntry(index + 1));
      let historicalReads = 0;
      let latest = loaded;
      let latestBefore = 51;
      const missing = Array.from({ length: 49 }, (_, index) => makeEntry(151 + index));
      const evidence: Record<string, number | null> = {
        fixtureRows: 100,
        maxFixtureRows: 200,
        cpuThrottlingRate: 4,
        viewportHeight: 720,
      };
      const started = performance.now();
      await page.route("**/rpc/tasks/list", (route) =>
        authResponse(route, { json: [task, second] }),
      );
      await page.route("**/rpc/tasks/get", (route) => {
        const input = route.request().postDataJSON()?.json;
        if (input?.id === second.id)
          return authResponse(route, {
            json: { task: second, activity: [], events: [], requests: [] },
          });
        const historical = input?.beforeActivity !== undefined;
        if (historical) historicalReads++;
        return authResponse(route, {
          json: {
            task,
            activity: historical ? (input.beforeActivity === 200 ? missing : older) : latest,
            events: [],
            requests: [],
            ...(historical ? {} : { activityBefore: latestBefore }),
          },
        });
      });
      await connectedProject(page, task.deviceId, task.projectId);
      await page.goto(
        base +
          "/tasks?" +
          new URLSearchParams({
            ...(surface === "Desktop" ? { scope: "remote" } : {}),
            device: task.deviceId,
            project: task.projectId,
          }),
      );
      await page.getByRole("button", { name: /Conversation reading fixture/ }).click();
      const viewport = page.locator("[data-conversation]");
      await expect(viewport).toHaveAttribute("data-conversation-mode", "virtual");
      // Acceptance is a fixed 720px scroll viewport, independent of the app shell's size.
      await viewport.evaluate((element) => {
        element.style.height = "720px";
        element.style.maxHeight = "720px";
      });
      const rows = viewport.locator("[data-conversation-row]");
      await viewport.evaluate((element) => {
        const sample = () => {
          if (element.getAttribute("data-conversation-mode") !== "virtual") return;
          element.dataset.peakVirtualRows = String(
            Math.max(
              Number(element.dataset.peakVirtualRows ?? 0),
              element.querySelectorAll("[data-conversation-row]").length,
            ),
          );
        };
        sample();
        new MutationObserver(sample).observe(element, { childList: true, subtree: true });
      });
      await expect(viewport.getByText("Conversation message 150.", { exact: false })).toBeVisible();
      evidence.loadMs = performance.now() - started;
      await expect.poll(() => rows.count()).toBeLessThanOrEqual(80);
      await viewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight / 2;
      });
      await expect.poll(() => rows.count()).toBeLessThanOrEqual(80);
      // Wait for the new virtual range, then choose and focus a link in one browser turn.
      let href: string | null = null;
      await expect
        .poll(async () => {
          href = await viewport.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const visible = [...element.querySelectorAll<HTMLAnchorElement>("a[href]")].find(
              (anchor) => {
                const rect = anchor.getBoundingClientRect();
                return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
              },
            );
            if (!visible) return null;
            visible.focus({ preventScroll: true });
            return document.activeElement === visible ? visible.getAttribute("href") : null;
          });
          return href;
        })
        .toBeTruthy();
      const link = viewport.locator(`a[href="${href}"]`);
      await expect(link).toBeFocused();
      await viewport.evaluate((element) => {
        element.scrollTop += element.clientHeight * 2;
      });
      await expect(link).not.toBeInViewport();
      await expect(link).toBeFocused();
      await expect.poll(() => rows.count()).toBeLessThanOrEqual(80);
      await viewport.focus();
      const fullStarted = performance.now();
      await page.getByRole("button", { name: "Show all loaded messages", exact: true }).click();
      await expect(viewport).toHaveAttribute("data-conversation-mode", "full");
      await expect(rows).toHaveCount(101);
      evidence.fullModeMs = performance.now() - fullStarted;
      expect(historicalReads).toBe(0);
      await expect(viewport.getByText("Conversation message 51.", { exact: false })).toHaveCount(1);
      // Full-text mode reflects revisions to previously loaded messages.
      const first = loaded[0]!;
      if (first.kind === "message")
        loaded[0] = {
          ...first,
          revision: 2,
          text: "Revised early message. " + "A much longer historical paragraph. ".repeat(200),
        };
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await expect(viewport.getByText(/Revised early message/)).toHaveCount(1);
      const virtualStarted = performance.now();
      await page.getByRole("button", { name: "Use virtual scrolling", exact: true }).click();
      await expect(viewport).toHaveAttribute("data-conversation-mode", "virtual");
      evidence.virtualModeMs = performance.now() - virtualStarted;
      await expect.poll(() => rows.count()).toBeLessThanOrEqual(80);
      await test.step("loads earlier messages on request", async () => {
        await viewport.evaluate((element) => {
          element.scrollTop = 0;
        });
        const earlier = viewport.getByRole("button", {
          name: "Load earlier messages",
          exact: true,
        });
        await expect(earlier).toBeVisible();
        await earlier.click();
        await expect.poll(() => historicalReads).toBe(1);
      });
      await page.getByRole("button", { name: "Show all loaded messages", exact: true }).click();
      await expect(rows).toHaveCount(151);
      latest = [makeEntry(200)];
      latestBefore = 200;
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      const gap = viewport.getByRole("button", { name: /load the missing history/i });
      await expect(gap).toHaveCount(1);
      await gap.evaluate((element) => {
        const region = element.closest<HTMLElement>("[data-conversation]")!;
        region.scrollTop +=
          element.getBoundingClientRect().top -
          region.getBoundingClientRect().top -
          region.clientTop;
      });
      await expect(gap).toBeVisible();
      await gap.click();
      await expect(gap).toHaveCount(0);
      await expect(rows).toHaveCount(201);
      evidence.peakVirtualRows = Number(await viewport.getAttribute("data-peak-virtual-rows"));
      expect(evidence.peakVirtualRows).toBeGreaterThan(0);
      expect(evidence.peakVirtualRows).toBeLessThanOrEqual(80);
      evidence.usedJSHeapSizeBytes = await page.evaluate(
        () =>
          (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
            ?.usedJSHeapSize ?? null,
      );
      console.info(JSON.stringify({ benchmark: "conversation-browser", surface, ...evidence }));
      await test.info().attach("conversation-performance.json", {
        body: JSON.stringify(evidence, null, 2),
        contentType: "application/json",
      });
      await page.getByRole("link", { name: /Another conversation fixture/ }).click();
      await expect(viewport).toHaveAttribute("data-conversation-mode", "virtual");
      await expect(rows).toHaveCount(1);
    },
  );
}
