import { expect as baseExpect, test, type Locator } from "@playwright/test";
import { selectOption } from "../helpers/select.js";
import { expectSurfaceAtRest } from "../helpers/geometry.js";
import { capture } from "../helpers/capture.js";
import { fileURLToPath } from "node:url";

const timeout = 5_000;
const expect = baseExpect.configure({ timeout });
const apiUrl = process.env.CONTROL_E2E_API_URL;
const windowSize = 30;
const messageCount = 195;

interface ReadingAnchor {
  id: string;
  offset: number;
}

async function firstVisibleMessage(log: Locator): Promise<ReadingAnchor> {
  await expectSurfaceAtRest(log.page(), log);
  return log.evaluate(
    (node) => {
      const bounds = node.getBoundingClientRect();
      for (const message of node.querySelectorAll<HTMLElement>("[data-message-id]")) {
        const box = message.getBoundingClientRect();
        if (box.bottom <= bounds.top + 1 || box.top >= bounds.bottom - 1) continue;
        return { id: message.dataset.messageId!, offset: box.top - bounds.top };
      }
      throw new Error("A visible message must anchor the reader");
    },
    undefined,
    { timeout },
  );
}

async function expectAnchor(log: Locator, anchor: ReadingAnchor) {
  await expectSurfaceAtRest(log.page(), log);
  await expect
    .poll(
      async () => {
        const row = log.locator(`[data-message-id=${JSON.stringify(anchor.id)}]`);
        const offset = await row.evaluate(
          (node) =>
            node.getBoundingClientRect().top -
            node.closest('[role="log"]')!.getBoundingClientRect().top,
          undefined,
          { timeout },
        );
        return Math.abs(offset - anchor.offset);
      },
      {
        timeout,
        message: "History and live events must preserve the same message and reading offset",
      },
    )
    .toBeLessThanOrEqual(2);
}

/** The same history contract and reader are mounted in both compiled clients. */
export function registerTests() {
  test("loads bounded history without moving the reader during paging or live replies", async ({
    page,
    baseURL,
  }, info) => {
    test.skip(!apiUrl, "Requires the owned backend fixture from bun run test backends --with-e2e");
    if (!apiUrl || !baseURL) return;
    test.setTimeout(90_000);
    const origin = new URL(baseURL).origin;
    const frames: string[] = [];
    page.on("websocket", (socket) => {
      socket.on("framereceived", ({ payload }) => frames.push(String(payload)));
    });
    const signedIn = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
      headers: { origin },
      timeout,
      data: { email: "control-e2e@example.com", password: "Raypx-control-test-123" },
    });
    expect(signedIn.status()).toBe(200);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${baseURL}/agents`, { timeout });
    const suffix = `${info.project.name}-${crypto.randomUUID()}`;
    await page.getByRole("button", { name: "Space", exact: true }).click({ timeout });
    await page.getByRole("menuitem", { name: "New Space", exact: true }).click({ timeout });
    const space = page.getByRole("dialog", { name: "New Space", exact: true });
    await expectSurfaceAtRest(page, space);
    await space
      .getByRole("textbox", { name: "Space name", exact: true })
      .pressSequentially(`History ${suffix}`, { timeout });
    await space.getByRole("button", { name: "Create Space", exact: true }).click({ timeout });
    await expect(space).toBeHidden();
    await page.getByRole("button", { name: "New Agent", exact: true }).click({ timeout });
    const agent = page.getByRole("dialog", { name: "New Agent", exact: true });
    await expectSurfaceAtRest(page, agent);
    await agent
      .getByRole("textbox", { name: "Name", exact: true })
      .pressSequentially(`History reader ${suffix}`, { timeout });
    await selectOption(
      page,
      agent.getByRole("combobox", { name: "Model", exact: true }),
      "browser-fixture",
      { timeout },
    );
    const opening = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname.endsWith("/rpc/conversations/history"),
      { timeout },
    );
    await agent.getByRole("button", { name: "Create Agent", exact: true }).click({ timeout });
    const { json: selection } = (await opening).postDataJSON() as {
      json: { spaceId: string; conversationId: string; limit: number };
    };
    expect(selection.limit).toBe(windowSize);
    await expect(agent).toBeHidden();
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get("spaceId") === selection.spaceId && url.searchParams.has("agentId"),
    );
    const seed = await page.request.post(`${apiUrl}/fixture/conversation/history`, {
      headers: { origin },
      timeout,
      data: {
        spaceId: selection.spaceId,
        conversationId: selection.conversationId,
        count: messageCount,
        prefix: `History ${suffix}`,
      },
    });
    expect(seed.status()).toBe(200);
    const seeded = (await seed.json()) as {
      messages: Array<{ id: string; sequence: number; text: string }>;
    };
    await page.reload({ timeout });
    const log = page.getByRole("log", { name: "Conversation", exact: true });
    await expectSurfaceAtRest(page, log);
    await expect(log).toHaveAttribute("data-history-count", String(windowSize));
    await expect(page.getByText(seeded.messages[0]!.text, { exact: true })).toHaveCount(0);
    await expect(page.getByText(seeded.messages.at(-1)!.text, { exact: true })).toBeVisible();

    let nextRequest: (() => void) | undefined;
    let releaseRequest: (() => void) | undefined;
    await page.route("**/rpc/conversations/history", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const input = route.request().postDataJSON() as {
        json: { before?: { beforeSequence: number } };
      };
      if (!input.json.before) return route.continue();
      let gateTimer: ReturnType<typeof setTimeout> | undefined;
      const waiting = new Promise<void>((resolve) => {
        releaseRequest = resolve;
        gateTimer = setTimeout(resolve, timeout);
      });
      nextRequest?.();
      await waiting;
      clearTimeout(gateTimer);
      return route.continue();
    });
    for (let index = 0; index < 3; index++) {
      const keyboardAnchor = index === 2 ? await firstVisibleMessage(log) : undefined;
      let requested = false;
      nextRequest = () => {
        requested = true;
      };
      if (index < 2) {
        await log.evaluate(
          (node) => {
            node.scrollTop = 0;
            node.dispatchEvent(new Event("scroll"));
          },
          undefined,
          { timeout },
        );
      } else {
        // A keyboard reader can invoke the explicit control without losing the current line.
        await page
          .getByRole("button", { name: "Load earlier messages", exact: true })
          .press("Enter", { timeout });
      }
      await expect.poll(() => requested, { timeout }).toBe(true);
      const anchor = keyboardAnchor ?? (await firstVisibleMessage(log));
      const response = page.waitForResponse(
        (value) =>
          value.request().method() === "POST" &&
          new URL(value.url()).pathname.endsWith("/rpc/conversations/history"),
        { timeout },
      );
      releaseRequest?.();
      const body = (await (await response).json()) as {
        json: { messages: Array<{ sequence: number }> };
      };
      const last = messageCount - (index + 1) * windowSize;
      expect(body.json.messages.map((message) => message.sequence)).toEqual(
        Array.from({ length: windowSize }, (_, offset) => last - windowSize + 1 + offset),
      );
      await expect(log).toHaveAttribute("data-history-count", String((index + 2) * windowSize));
      await expectSurfaceAtRest(page, log);
      await expectAnchor(log, anchor);
    }

    const anchor = await firstVisibleMessage(log);
    const livePrompt = `A live message while reading history ${suffix}`;
    const firstFrame = frames.length;
    const sent = await page.request.post(`${apiUrl}/rpc/conversations/send`, {
      headers: { origin },
      timeout,
      data: {
        json: {
          spaceId: selection.spaceId,
          conversationId: selection.conversationId,
          message: { text: livePrompt, idempotencyKey: crypto.randomUUID() },
        },
      },
    });
    expect(sent.status()).toBe(200);
    await expect
      .poll(
        () =>
          frames
            .slice(firstFrame)
            .some(
              (frame) =>
                frame.includes(selection.conversationId) && frame.includes("Fixture reply"),
            ),
        { timeout },
      )
      .toBe(true);
    await expect(log).toHaveAttribute("data-history-count", "121");
    await expectAnchor(log, anchor);
    const completed = await page.request.post(`${apiUrl}/fixture/conversation/complete`, {
      headers: { origin },
      timeout,
      data: { conversationId: selection.conversationId },
    });
    expect(completed.status()).toBe(204);
    await expect
      .poll(
        () =>
          frames
            .slice(firstFrame)
            .some(
              (frame) =>
                frame.includes(selection.conversationId) &&
                frame.includes('"kind":"reply.segment"'),
            ),
        { timeout },
      )
      .toBe(true);
    await expectAnchor(log, anchor);
    await page.unroute("**/rpc/conversations/history");
    // Traverse beyond the retained window, then reload released rows in both directions.
    for (let index = 0; index < 2; index++) {
      await page
        .getByRole("button", { name: "Load earlier messages", exact: true })
        .press("Enter", { timeout });
      await expect(log).toHaveAttribute("data-history-count", "150");
      await expect(
        page.getByRole("button", { name: "Load later messages", exact: true }),
      ).toBeEnabled();
      await expectAnchor(log, anchor);
    }
    await page.getByRole("button", { name: "Jump to latest", exact: true }).click({ timeout });
    await expect(log).toHaveAttribute("data-history-count", String(windowSize));
    await expect(page.getByText(livePrompt, { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Load earlier messages", exact: true })
      .press("Enter", { timeout });
    await expect(log).toHaveAttribute("data-history-count", "60");
    if (info.project.name === "web" && process.env.RAYPX_E2E_SCREENSHOTS === "1") {
      await log.evaluate(
        (node) => {
          node.scrollTop = node.scrollHeight / 4;
        },
        undefined,
        { timeout },
      );
      for (const viewport of [
        { width: 1440, height: 860 },
        { width: 375, height: 812 },
      ]) {
        await page.setViewportSize(viewport);
        await expectSurfaceAtRest(page, log);
        await capture(page, {
          path: fileURLToPath(
            new URL(
              `../../../.artifacts/conversation-history-web-${viewport.width}x${viewport.height}.png`,
              import.meta.url,
            ),
          ),
        });
      }
    }
    await page.reload({ timeout });
    await expect(log).toHaveAttribute("data-history-count", String(windowSize));
    await expect(page.getByText(livePrompt, { exact: true })).toBeVisible();
    await expect(page.getByText("Fixture reply completed.", { exact: true })).toBeVisible();
    await expect(page.getByText(seeded.messages[0]!.text, { exact: true })).toHaveCount(0);
  });
}
