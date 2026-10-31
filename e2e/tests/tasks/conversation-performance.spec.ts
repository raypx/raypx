import { expect, type Locator } from "@playwright/test";
import { test } from "../helpers/browser-fixture.js";
import { surfaces } from "../helpers/surfaces.js";
import { authResponse, signedInAccount, webShellFixture } from "../helpers/account-fixture.js";

import type { AgentTask, TaskActivity } from "@raypx/core/tasks";

async function readingPosition(viewport: Locator) {
  return viewport.evaluate((element) => {
    const top = element.getBoundingClientRect().top + element.clientTop;
    const row = [...element.querySelectorAll<HTMLElement>("[data-conversation-row]")].find(
      (item) =>
        item.dataset.conversationRow?.startsWith("activity:") &&
        item.getBoundingClientRect().bottom > top &&
        item.getBoundingClientRect().top < top + element.clientHeight,
    );
    return row
      ? { id: row.dataset.conversationRow!, offset: row.getBoundingClientRect().top - top }
      : null;
  });
}
async function settledReadingPosition(viewport: Locator) {
  // A scroll event and measured virtual rows settle on separate animation frames.
  // Sample the reader only after both position and the visible ID stop changing.
  await viewport.evaluate(async (element) => {
    let previous = "",
      stable = 0;
    for (let frame = 0; frame < 120 && stable < 4; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const top = element.getBoundingClientRect().top + element.clientTop;
      const row = [...element.querySelectorAll<HTMLElement>("[data-conversation-row]")].find(
        (item) => {
          const rect = item.getBoundingClientRect();
          return (
            item.dataset.conversationRow?.startsWith("activity:") &&
            rect.bottom > top &&
            rect.top < top + element.clientHeight
          );
        },
      );
      const sample = `${element.scrollTop}:${row?.dataset.conversationRow}:${row?.getBoundingClientRect().top}`;
      stable = row && sample === previous ? stable + 1 : 0;
      previous = sample;
    }
  });
  return readingPosition(viewport);
}
async function expectReadingPosition(
  viewport: Locator,
  saved: { id: string; offset: number } | null,
) {
  expect(saved).not.toBeNull();
  await expect
    .poll(async () => {
      return viewport.evaluate((element, position) => {
        const row = [...element.querySelectorAll<HTMLElement>("[data-conversation-row]")].find(
          (item) => item.dataset.conversationRow === position?.id,
        );
        return row && position
          ? Math.abs(
              row.getBoundingClientRect().top -
                element.getBoundingClientRect().top -
                element.clientTop -
                position.offset,
            )
          : 1000;
      }, saved);
    })
    .toBeLessThan(3);
}

for (const [surface, base] of surfaces) {
  test(
    `${surface} long conversation keeps virtual rows bounded and loaded full text reachable`,
    { tag: [`@${surface.toLowerCase()}`, "@performance"] },
    async ({ page }) => {
      test.setTimeout(120_000);
      if (surface === "Web") await webShellFixture(page);
      await signedInAccount(page);
      const now = new Date().toISOString();
      const task: AgentTask = {
        id: crypto.randomUUID(),
        deviceId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        provider: "codex",
        mode: "run",
        prompt: "Long conversation performance fixture",
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
      const loaded = Array.from({ length: 10_000 }, (_, index) => makeEntry(index + 101));
      const older = Array.from({ length: 100 }, (_, index) => makeEntry(index + 1));
      let historicalReads = 0;
      let latest = loaded;
      let latestBefore = 101;
      const missing = Array.from({ length: 99 }, (_, index) => makeEntry(10101 + index));
      const evidence: Record<string, number | null> = { fixtureRows: 10_000, viewportHeight: 720 };
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
            activity: historical ? (input.beforeActivity === 10200 ? missing : older) : latest,
            events: [],
            requests: [],
            ...(historical ? {} : { activityBefore: latestBefore }),
          },
        });
      });
      await page.goto(base + "/tasks");
      if (surface === "Desktop")
        await page.getByRole("tab", { name: "Connected computers", exact: true }).click();
      await page.getByRole("button", { name: /Long conversation performance fixture/ }).click();
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
      await expect(
        viewport.getByText("Conversation message 10100.", { exact: false }),
      ).toBeVisible();
      evidence.loadMs = performance.now() - started;
      await expect.poll(() => rows.count()).toBeLessThanOrEqual(80);
      await viewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight / 2;
      });
      await expect.poll(() => rows.count()).toBeLessThanOrEqual(80);
      await expect
        .poll(() => viewport.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(1000);
      await expect.poll(() => readingPosition(viewport)).not.toBeNull();
      // Pin the locator to a visible link's identity; a range-relative first()
      // locator would silently identify a different link after pointer scrolling.
      const href = await viewport.evaluate((element) => {
        const top = element.getBoundingClientRect().top;
        return [...element.querySelectorAll<HTMLAnchorElement>("a")]
          .find((link) => {
            const rect = link.getBoundingClientRect();
            return rect.top >= top && rect.bottom < top + element.clientHeight;
          })
          ?.getAttribute("href");
      });
      expect(href).toBeTruthy();
      const link = viewport.locator(`a[href="${href}"]`);
      await link.evaluate((element) => element.focus({ preventScroll: true }));
      await viewport.evaluate((element) => {
        element.scrollTop += 3000;
      });
      await expect(link).toBeFocused();
      await expect.poll(() => rows.count()).toBeLessThanOrEqual(80);
      await viewport.focus();
      await expect.poll(() => readingPosition(viewport)).not.toBeNull();
      const beforeResize = await settledReadingPosition(viewport);
      const predecessorId = await viewport.evaluate((element) => {
        const top = element.getBoundingClientRect().top + element.clientTop;
        return [...element.querySelectorAll<HTMLElement>("[data-conversation-row]")]
          .find(
            (row) =>
              row.dataset.conversationRow?.startsWith("activity:") &&
              row.getBoundingClientRect().bottom <= top,
          )
          ?.dataset.conversationRow?.slice("activity:".length);
      });
      expect(predecessorId).toBeTruthy();
      const predecessorIndex = loaded.findIndex((entry) => entry.id === predecessorId);
      const predecessor = loaded[predecessorIndex]!;
      if (predecessor.kind !== "message") throw new Error("Fixture requires a message predecessor");
      loaded[predecessorIndex] = {
        ...predecessor,
        revision: 2,
        text:
          "Revised virtual predecessor. " + "A growing paragraph above the reader. ".repeat(200),
      };
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await expect(viewport.getByText(/Revised virtual predecessor/)).toHaveCount(1);
      await settledReadingPosition(viewport);
      await expectReadingPosition(viewport, beforeResize);
      await expect.poll(() => rows.count()).toBeLessThanOrEqual(80);
      const saved = await settledReadingPosition(viewport);
      const fullStarted = performance.now();
      await page.getByRole("button", { name: "Show all loaded messages", exact: true }).click();
      await expect(viewport).toHaveAttribute("data-conversation-mode", "full");
      await expect(rows).toHaveCount(10_001);
      evidence.fullModeMs = performance.now() - fullStarted;
      expect(historicalReads).toBe(0);
      await expectReadingPosition(viewport, saved);
      await expect(viewport.getByText("Conversation message 101.", { exact: false })).toHaveCount(
        1,
      );
      // Revising an earlier message changes the measured height above the reader.
      const first = loaded[0]!;
      if (first.kind === "message")
        loaded[0] = {
          ...first,
          revision: 2,
          text: "Revised early message. " + "A much longer historical paragraph. ".repeat(200),
        };
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await expect(viewport.getByText(/Revised early message/)).toHaveCount(1);
      await expectReadingPosition(viewport, saved);
      const virtualStarted = performance.now();
      await page.getByRole("button", { name: "Use virtual scrolling", exact: true }).click();
      await expectReadingPosition(viewport, saved);
      evidence.virtualModeMs = performance.now() - virtualStarted;
      await expect.poll(() => rows.count()).toBeLessThanOrEqual(80);
      await viewport.evaluate((element) => {
        element.scrollTop = 0;
      });
      const earlier = viewport.getByRole("button", { name: "Load earlier messages", exact: true });
      await expect(earlier).toBeVisible();
      const beforePrepend = await settledReadingPosition(viewport);
      await earlier.click();
      await expect.poll(() => historicalReads).toBe(1);
      await expectReadingPosition(viewport, beforePrepend);
      await page.getByRole("button", { name: "Show all loaded messages", exact: true }).click();
      await expect(rows).toHaveCount(10_101);
      latest = [makeEntry(10200)];
      latestBefore = 10200;
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      const gap = viewport.getByRole("button", {
        name: "Some messages are missing here. Load the missing history.",
        exact: true,
      });
      await expect(gap).toHaveCount(1);
      await gap.evaluate((element) => {
        const region = element.closest<HTMLElement>("[data-conversation]")!;
        region.scrollTop +=
          element.getBoundingClientRect().top -
          region.getBoundingClientRect().top -
          region.clientTop;
      });
      await expect(gap).toBeVisible();
      const beforeGap = await settledReadingPosition(viewport);
      await gap.click();
      await expect(gap).toHaveCount(0);
      await expectReadingPosition(viewport, beforeGap);
      await expect(rows).toHaveCount(10_201);
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
      await page.getByRole("button", { name: /Another conversation fixture/ }).click();
      await expect(viewport).toHaveAttribute("data-conversation-mode", "virtual");
      await expect(rows).toHaveCount(1);
    },
  );
}
