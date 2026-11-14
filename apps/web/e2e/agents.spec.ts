import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  selectOption,
  expectConversationHeaderControls,
  expectSurfaceAtRest,
} from "@raypx/e2e/testing";

const apiUrl = process.env.CONTROL_E2E_API_URL;
const actionTimeout = 5_000;

/** Transcript rows can be clipped vertically while their horizontal geometry remains relevant. */
async function expectRowAtRest(row: Locator) {
  let previous = "";
  let stable = 0;
  await expect
    .poll(
      async () => {
        const box = await row.boundingBox({ timeout: actionTimeout });
        if (!box) return false;
        const signature = [box.x, box.y, box.width, box.height]
          .map((value) => Math.round(value * 10))
          .join(":");
        stable = signature === previous ? stable + 1 : 0;
        previous = signature;
        return stable >= 2;
      },
      { timeout: actionTimeout },
    )
    .toBe(true);
}

async function expectConversationGeometry(page: Page, name: string, sheetOpen = false) {
  if (sheetOpen) {
    const sheet = page.getByRole("dialog", { name: "Team computer", exact: true });
    await expect(sheet).toBeVisible();
    await sheet.evaluate(async (node) => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await Promise.all(
        node
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
  }
  // DOM locators also measure the conversation while the modal sheet makes it inert.
  const pane = page.locator('section[aria-label="Conversation"]');
  const heading = page.locator("[data-conversation-header] h1");
  const bubble = pane.locator("[data-reply-bubble]").first();
  await expect(heading).toHaveText(name);
  await expect(page.locator("[data-conversation-header] h1")).toHaveCount(1);
  await expect(pane.locator("article h3[title]")).toHaveCount(0);
  await expect(pane.locator("h1, h2")).toHaveCount(0);
  await expectSurfaceAtRest(page, pane);
  await expectSurfaceAtRest(page, heading);
  await expectRowAtRest(bubble);
  const paneBox = await pane.boundingBox();
  const headingBox = await heading.boundingBox();
  const bubbleBox = await bubble.boundingBox();
  const viewport = page.viewportSize()!;
  expect(headingBox!.x).toBeGreaterThanOrEqual(0);
  expect(headingBox!.x + headingBox!.width).toBeLessThanOrEqual(viewport.width);
  await expect(heading).toHaveCSS("text-overflow", "ellipsis");
  expect(bubbleBox!.x).toBeGreaterThanOrEqual(paneBox!.x);
  expect(bubbleBox!.x + bubbleBox!.width).toBeLessThanOrEqual(paneBox!.x + paneBox!.width);
  // The fixture's one-line reply should hug its text when space permits.
  if (paneBox!.width > 400) expect(bubbleBox!.width).toBeLessThan(paneBox!.width * 0.9);
  await expect.poll(() => pane.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await expect.poll(() => pane.evaluate((node) => node.scrollLeft)).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      pane.evaluate((node) => {
        for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
          if (ancestor.scrollWidth > ancestor.clientWidth || ancestor.scrollLeft !== 0)
            return false;
        }
        return true;
      }),
    )
    .toBe(true);
  if (!sheetOpen) {
    const indicator = page.getByRole("button", { name: "Computer: Running", exact: true });
    await expect(indicator).toBeVisible();
    expect(await indicator.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(indicator).toHaveAccessibleName("Computer: Running");
    await expect(heading).toHaveAccessibleName(name);
    await expectSurfaceAtRest(page, indicator);
    const indicatorBox = await indicator.boundingBox();
    expect(headingBox!.x + headingBox!.width).toBeLessThanOrEqual(indicatorBox!.x);
  }
  for (const selector of ["[data-approval-card]", "[data-tool-activity]"]) {
    const row = pane.locator(selector).first();
    if ((await row.count()) === 0) continue;
    await expect(row).toBeVisible();
    await expectRowAtRest(row);
    const box = await row.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(paneBox!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(paneBox!.x + paneBox!.width);
    expect(await row.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
}

test(
  "Conversation Agent streams, requests approval, resumes and preserves history after reload",
  { tag: "@web" },
  async ({ page }) => {
    test.skip(!apiUrl, "Requires the owned backend fixture from bun run test backends --with-e2e");
    test.setTimeout(120_000);
    const name = `Conversation fixture 长名称 ${"long-name-".repeat(5)}${crypto.randomUUID()}`;
    const prompt = `Remember this message ${crypto.randomUUID()}`;
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("http://127.0.0.1:4173/agents", { timeout: actionTimeout });
    await page
      .getByLabel("Email address", { exact: true })
      .pressSequentially("control-e2e@example.com", { timeout: actionTimeout });
    await page
      .getByLabel("Password", { exact: true })
      .pressSequentially("Raypx-control-test-123", { timeout: actionTimeout });
    await page
      .getByRole("button", { name: "Sign in", exact: true })
      .click({ timeout: actionTimeout });
    await expect(page).toHaveURL(/\/agents(?:\?|$)/);
    await expect(page.locator("[data-workspace-home]")).toBeVisible();
    await page
      .getByRole("button", { name: "Space", exact: true })
      .click({ timeout: actionTimeout });
    await page
      .getByRole("menuitem", { name: "New Space", exact: true })
      .click({ timeout: actionTimeout });
    const spaceForm = page.getByRole("dialog", { name: "New Space", exact: true });
    await spaceForm
      .getByRole("textbox", { name: "Space name", exact: true })
      .pressSequentially(`Conversation ${crypto.randomUUID()}`, { timeout: actionTimeout });
    await spaceForm
      .getByRole("button", { name: "Create Space", exact: true })
      .click({ timeout: actionTimeout });
    await expect(spaceForm).toBeHidden();
    await page
      .getByRole("button", { name: /^(?:New Agent|Create Agent)$/, exact: true })
      .click({ timeout: actionTimeout });
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: "Name", exact: true })
      .pressSequentially(name, { timeout: actionTimeout });
    await dialog
      .getByRole("textbox", { name: "Instructions", exact: true })
      .pressSequentially("Reply briefly.", { timeout: actionTimeout });
    await selectOption(
      page,
      dialog.getByRole("combobox", { name: "Model", exact: true }),
      "browser-fixture",
      { timeout: actionTimeout },
    );
    await dialog
      .getByRole("button", { name: "Create Agent", exact: true })
      .click({ timeout: actionTimeout });
    await expect(dialog).toBeHidden();
    const computer = page.getByRole("button", { name: /^Computer:/ });
    await expect(computer).toBeVisible();
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 1024, height: 768 },
      { width: 1280, height: 800 },
      { width: 1440, height: 860 },
    ]) {
      await page.setViewportSize(viewport);
      await expectConversationHeaderControls(page);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await expectConversationHeaderControls(page);
    await test.step("Open the unobscured Computer control at phone width", async () => {
      await computer.click({ timeout: 2000 });
    });
    await page
      .getByRole("button", { name: "Start computer", exact: true })
      .click({ timeout: actionTimeout });
    await expect(page.getByRole("button", { name: "Stop computer", exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Close computer panel", exact: true })
      .click({ timeout: actionTimeout });
    await expect(page.getByRole("dialog", { name: "Team computer", exact: true })).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Computer: Running", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .pressSequentially(prompt, { timeout: actionTimeout });
    const sending = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname.endsWith("/rpc/conversations/send"),
      { timeout: actionTimeout },
    );
    await page.getByRole("button", { name: "Send", exact: true }).click({ timeout: actionTimeout });
    const {
      json: { conversationId },
    } = (await sending).postDataJSON() as { json: { conversationId: string } };
    await expect(page.getByText(prompt, { exact: true })).toHaveCount(1);
    await expect(page.getByText("Fixture reply", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop reply", exact: true })).toBeVisible();
    const complete = await page.request.post(`${apiUrl}/fixture/conversation/complete`, {
      headers: { origin: "http://127.0.0.1:4173" },
      timeout: actionTimeout,
      data: { conversationId },
    });
    expect(complete.status()).toBe(204);
    await expect(page.getByText("Fixture reply completed.", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Stop reply", exact: true })).toHaveCount(0);
    await page.reload({ timeout: actionTimeout });
    await expect(page.getByText(prompt, { exact: true })).toHaveCount(1);
    await expect(page.getByText("Fixture reply completed.", { exact: true })).toHaveCount(1);
    const writePrompt = `Fixture file write ${crypto.randomUUID()}`;
    const editor = page.getByRole("textbox", { name: "Message", exact: true });
    await editor.pressSequentially(writePrompt, { timeout: actionTimeout });
    await page.getByRole("button", { name: "Send", exact: true }).click({ timeout: actionTimeout });
    const approval = page.locator("[data-approval-card]").first();
    await expect(approval).toBeVisible();
    await expect(approval.getByText("Write a file", { exact: true })).toBeVisible();
    await expect(approval.getByText("browser-fixture.txt", { exact: true })).toBeVisible();
    await expect(approval.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
    // A request leaves the composer usable; no message is submitted by restoring a draft.
    await editor.pressSequentially("A draft while approval is pending", { timeout: actionTimeout });
    await expect(
      page.getByRole("button", { name: "Send message during reply", exact: true }),
    ).toBeEnabled();
    await expect(page.getByRole("button", { name: "Stop reply", exact: true })).toHaveCount(0);
    await page.reload({ timeout: actionTimeout });
    await expect(approval).toBeVisible();
    await expect(editor).toHaveValue("A draft while approval is pending");
    await expect(page.getByText(writePrompt, { exact: true })).toHaveCount(1);
    await editor.fill("", { timeout: actionTimeout });
    await expect(page.locator("[data-tool-call]")).toHaveCount(0);
    const waitingSteps = page.getByRole("button", { name: "1 step", exact: true });
    await expect(waitingSteps).toBeVisible();
    await expect(waitingSteps).toHaveAccessibleDescription("Waiting for approval");
    await expect(approval.getByText("browser-fixture.txt", { exact: true })).toHaveCount(1);
    await expect(
      approval.getByText("Write file: browser-fixture.txt", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Review 1 approval", exact: true })).toHaveCount(
      0,
    );
    // Both mounts use a bounded log and a composer at the bottom of the shell.
    for (const viewport of [
      { width: 1440, height: 860 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
      { width: 375, height: 812 },
    ]) {
      const { width } = viewport;
      await page.setViewportSize(viewport);
      if (width >= 1280) {
        await expect(page.locator('[data-slot="sidebar"][data-state="expanded"]')).toBeVisible();
      }
      const log = page.getByRole("log", { name: "Conversation", exact: true });
      const viewportEditor = page.getByRole("textbox", { name: "Message", exact: true });
      await expect(log).toBeVisible();
      await expectSurfaceAtRest(page, log);
      await expectSurfaceAtRest(page, viewportEditor.locator("xpath=ancestor::form"));
      await expectSurfaceAtRest(page, page.getByRole("main"));
      const history = await log.boundingBox();
      const composer = await viewportEditor.locator("xpath=ancestor::form").boundingBox();
      const main = await page.getByRole("main").boundingBox();
      expect(history!.height).toBeGreaterThan(200);
      expect(history!.y + history!.height).toBeLessThanOrEqual(composer!.y);
      expect(main!.y + main!.height - composer!.y - composer!.height).toBeLessThan(64);
      await expectConversationGeometry(page, name);
      const panel = page.getByRole(width < 1280 ? "dialog" : "complementary", {
        name: "Team computer",
        exact: true,
      });
      if (!(await panel.isVisible())) await computer.click({ timeout: actionTimeout });
      await expect(panel).toBeVisible();
      await expectConversationGeometry(page, name, width < 1280);
      expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await panel
        .getByRole("button", { name: "Close computer panel", exact: true })
        .click({ timeout: actionTimeout });
      await expect(panel).toBeHidden();
      // The indicator returns to the accessibility tree after the narrow sheet closes.
      await expectConversationGeometry(page, name);
      if (width >= 1280) {
        const row = page
          .getByRole("navigation", { name: "Raypx", exact: true })
          .getByRole("button", { name, exact: true });
        await expect(row).toBeVisible();
        await expect(row).toHaveAttribute("title", name);
        await expect(row).toHaveAttribute("aria-current", "page");
      }
    }
    await approval
      .getByRole("button", { name: "Approve", exact: true })
      .click({ timeout: actionTimeout });
    await expect(approval.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    await expect(approval).toHaveCount(0);
    await expect(editor).toBeFocused();
    const activity = page.locator("[data-tool-activity]").first();
    const activityToggle = activity.getByRole("button", { name: /^1 step/ });
    await expect(activityToggle).toHaveAttribute("aria-expanded", "false");
    await activityToggle.click({ timeout: actionTimeout });
    await expect(activity.getByText("Write a file", { exact: true })).toBeVisible();
    await expect(activity.getByText("Succeeded", { exact: true })).toBeVisible();
    await expect(activity.locator('[data-tool-call="browser-write-file"]')).toHaveCount(1);
    await expect(activity.getByText("browser-fixture.txt", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Fixture reply", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop reply", exact: true })).toBeVisible();
    const finishWrite = await page.request.post(`${apiUrl}/fixture/conversation/complete`, {
      headers: { origin: "http://127.0.0.1:4173" },
      timeout: actionTimeout,
      data: { conversationId },
    });
    expect(finishWrite.status()).toBe(204);
    await expect(page.getByText("Fixture reply completed.", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Stop reply", exact: true })).toHaveCount(0);
    const activityHistory = await activity.locator("[data-tool-call]").allTextContents();
    await activityToggle.click({ timeout: actionTimeout });
    for (const viewport of [
      { width: 1440, height: 860 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(viewport);
      await expectConversationGeometry(page, name);
      await page.getByRole("tab", { name: "Files", exact: true }).click({ timeout: actionTimeout });
      const files = page.getByRole("tabpanel").getByRole("region", { name: "Files", exact: true });
      await files
        .getByRole("treeitem", { name: "browser-fixture.txt", exact: true })
        .click({ timeout: actionTimeout });
      await expect(files.getByRole("region", { name: "File preview", exact: true })).toContainText(
        "A deterministic browser approval fixture.",
      );
      await expect(files.getByText("42 bytes", { exact: true })).toHaveCount(2);
      for (const surface of [files, files.locator("pre")]) {
        await expectSurfaceAtRest(page, surface);
        expect(await surface.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        const box = await surface.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      }
      await page
        .getByRole("tab", { name: "Activity", exact: true })
        .click({ timeout: actionTimeout });
      await expect(
        page.getByRole("tabpanel").getByText("Succeeded", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("tab", { name: "Conversation", exact: true })
        .click({ timeout: actionTimeout });
    }
    await page.reload({ timeout: actionTimeout });
    await expect(page.getByText(writePrompt, { exact: true })).toHaveCount(1);
    await expect(page.getByText("Fixture reply completed.", { exact: true })).toHaveCount(2);
    await expect(approval).toHaveCount(0);
    await activityToggle.click({ timeout: actionTimeout });
    await expect(activity.locator('[data-tool-call="browser-write-file"]')).toHaveCount(1);
    expect(await activity.locator("[data-tool-call]").allTextContents()).toEqual(activityHistory);
    await page.getByRole("tab", { name: "Files", exact: true }).click({ timeout: actionTimeout });
    const restoredFiles = page.getByRole("region", { name: "Files", exact: true });
    await restoredFiles
      .getByRole("treeitem", { name: "browser-fixture.txt", exact: true })
      .click({ timeout: actionTimeout });
    await expect(
      restoredFiles.getByRole("region", { name: "File preview", exact: true }),
    ).toContainText("A deterministic browser approval fixture.");
    await page
      .getByRole("tab", { name: "Conversation", exact: true })
      .click({ timeout: actionTimeout });
    await page
      .getByRole("button", { name: "Conversation actions", exact: true })
      .click({ timeout: actionTimeout });
    await expect(page.getByRole("menuitem", { name: "Edit Agent", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 375, height: 812 });
    await page
      .getByRole("button", { name: "Back to Agents", exact: true })
      .click({ timeout: actionTimeout });
    await expect(
      page
        .getByRole("navigation", { name: "Raypx", exact: true })
        .getByRole("button", { name, exact: true }),
    ).toBeFocused();
    await expect(page.locator("[data-workspace-home]")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  },
);
