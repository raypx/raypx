import { expect, test, type Page } from "@playwright/test";
import { selectOption, expectConversationHeaderControls } from "@raypx/e2e/testing";

const apiUrl = process.env.CONTROL_E2E_API_URL;

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
    const status = indicator.getByText("Running", { exact: true });
    expect(await status.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(heading).toHaveAccessibleName(name);
    const indicatorBox = await indicator.boundingBox();
    expect(headingBox!.x + headingBox!.width).toBeLessThanOrEqual(indicatorBox!.x);
  }
  for (const selector of ["[data-approval-card]", "[data-tool-activity]"]) {
    const row = pane.locator(selector).first();
    if ((await row.count()) === 0) continue;
    await expect(row).toBeVisible();
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
    const name = `Conversation fixture 长名称 ${"long-name-".repeat(5)}${crypto.randomUUID()}`;
    const prompt = `Remember this message ${crypto.randomUUID()}`;
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("http://127.0.0.1:4173/agents");
    await page.getByLabel("Email address", { exact: true }).fill("control-e2e@example.com");
    await page.getByLabel("Password", { exact: true }).fill("Raypx-control-test-123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/agents(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Agents", exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "New Agent", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await dialog.getByRole("textbox", { name: "Instructions", exact: true }).fill("Reply briefly.");
    await selectOption(
      page,
      dialog.getByRole("combobox", { name: "Model", exact: true }),
      "browser-fixture",
    );
    await dialog.getByRole("button", { name: "Create Agent", exact: true }).click();
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
    await page.getByRole("button", { name: "Start computer", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop computer", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close computer panel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Computer: Running", exact: true }),
    ).toBeVisible();
    await page.getByRole("textbox", { name: "Message", exact: true }).fill(prompt);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(prompt, { exact: true })).toHaveCount(1);
    await expect(page.getByText("Fixture reply", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop reply", exact: true })).toBeVisible();
    const complete = await page.request.post(`${apiUrl}/fixture/conversation/complete`, {
      headers: { origin: "http://127.0.0.1:4173" },
    });
    expect(complete.status()).toBe(204);
    await expect(page.getByText("Fixture reply completed.", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Stop reply", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(prompt, { exact: true })).toHaveCount(1);
    await expect(page.getByText("Fixture reply completed.", { exact: true })).toHaveCount(1);
    const writePrompt = `Fixture file write ${crypto.randomUUID()}`;
    const editor = page.getByRole("textbox", { name: "Message", exact: true });
    await editor.fill(writePrompt);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const approval = page.locator("[data-approval-card]").first();
    await expect(approval).toBeVisible();
    await expect(approval.getByText("Write a file", { exact: true })).toBeVisible();
    await expect(approval.getByText("browser-fixture.txt", { exact: true })).toBeVisible();
    await expect(approval.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
    // A request leaves the composer usable; no message is submitted by restoring a draft.
    await editor.fill("A draft while approval is pending");
    await expect(
      page.getByRole("button", { name: "Send message during reply", exact: true }),
    ).toBeEnabled();
    await expect(page.getByRole("button", { name: "Stop reply", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(approval).toBeVisible();
    await expect(editor).toHaveValue("A draft while approval is pending");
    await expect(page.getByText(writePrompt, { exact: true })).toHaveCount(1);
    await editor.fill("");
    await expect(page.locator("[data-tool-call]")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Used 1 tool Waiting for approval", exact: true }),
    ).toBeVisible();
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
      const history = await log.boundingBox();
      const composer = await viewportEditor.locator("xpath=ancestor::form").boundingBox();
      const main = await page.getByRole("main").boundingBox();
      expect(history!.height).toBeGreaterThan(200);
      expect(history!.y + history!.height).toBeLessThanOrEqual(composer!.y);
      expect(main!.y + main!.height - composer!.y - composer!.height).toBeLessThan(64);
      await expectConversationGeometry(page, name);
      await computer.click();
      const panel = page.getByRole(width < 1280 ? "dialog" : "complementary", {
        name: "Team computer",
        exact: true,
      });
      await expect(panel).toBeVisible();
      await expectConversationGeometry(page, name, width < 1280);
      expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await panel.getByRole("button", { name: "Close computer panel", exact: true }).click();
      await expect(panel).toBeHidden();
      // The indicator returns to the accessibility tree after the narrow sheet closes.
      await expectConversationGeometry(page, name);
      if (width >= 1280) {
        const row = page.getByRole("button", { name, exact: true });
        await expect(row).toBeVisible();
        await expect(row).toHaveAttribute("title", name);
        await expect(row).toHaveAttribute("aria-current", "page");
      }
    }
    await approval.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(approval.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    await expect(approval).toHaveCount(0);
    await expect(editor).toBeFocused();
    const activity = page.locator("[data-tool-activity]").first();
    const activityToggle = activity.getByRole("button", { name: /^Used 1 tool/ });
    await expect(activityToggle).toHaveAttribute("aria-expanded", "false");
    await activityToggle.click();
    await expect(activity.getByText("Write a file", { exact: true })).toBeVisible();
    await expect(activity.getByText("Succeeded", { exact: true })).toBeVisible();
    await expect(activity.locator('[data-tool-call="browser-write-file"]')).toHaveCount(1);
    await expect(activity.getByText("browser-fixture.txt", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Fixture reply", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop reply", exact: true })).toBeVisible();
    const finishWrite = await page.request.post(`${apiUrl}/fixture/conversation/complete`, {
      headers: { origin: "http://127.0.0.1:4173" },
    });
    expect(finishWrite.status()).toBe(204);
    await expect(page.getByText("Fixture reply completed.", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Stop reply", exact: true })).toHaveCount(0);
    const activityHistory = await activity.locator("[data-tool-call]").allTextContents();
    await activityToggle.click();
    for (const viewport of [
      { width: 1440, height: 860 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(viewport);
      await expectConversationGeometry(page, name);
      await computer.click();
      await expectConversationGeometry(page, name, viewport.width < 1280);
      const panel = page.getByRole(viewport.width < 1280 ? "dialog" : "complementary", {
        name: "Team computer",
        exact: true,
      });
      const files = panel.getByRole("region", { name: "Files", exact: true });
      await files.getByRole("treeitem", { name: "browser-fixture.txt", exact: true }).click();
      await expect(files.getByRole("region", { name: "File preview", exact: true })).toContainText(
        "A deterministic browser approval fixture.",
      );
      await expect(files.getByText("42 bytes", { exact: true })).toHaveCount(2);
      await expect(
        panel
          .getByRole("region", { name: "Activity", exact: true })
          .getByText("Succeeded", { exact: true }),
      ).toBeVisible();
      // The sheet slides in; measure only after it has come to rest inside the viewport.
      await expect
        .poll(async () => {
          const box = await panel.boundingBox();
          return box!.x + box!.width;
        })
        .toBeLessThanOrEqual(viewport.width);
      for (const surface of [panel, files, files.locator("pre")]) {
        expect(await surface.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        const box = await surface.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      }
      await panel.getByRole("button", { name: "Close computer panel", exact: true }).click();
    }
    await page.reload();
    await expect(page.getByText(writePrompt, { exact: true })).toHaveCount(1);
    await expect(page.getByText("Fixture reply completed.", { exact: true })).toHaveCount(2);
    await expect(approval).toHaveCount(0);
    await activityToggle.click();
    await expect(activity.locator('[data-tool-call="browser-write-file"]')).toHaveCount(1);
    expect(await activity.locator("[data-tool-call]").allTextContents()).toEqual(activityHistory);
    await computer.click();
    const restoredFiles = page.getByRole("region", { name: "Files", exact: true });
    await restoredFiles.getByRole("treeitem", { name: "browser-fixture.txt", exact: true }).click();
    await expect(
      restoredFiles.getByRole("region", { name: "File preview", exact: true }),
    ).toContainText("A deterministic browser approval fixture.");
    await page.getByRole("button", { name: "Close computer panel", exact: true }).click();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "Back to Agents", exact: true }).click();
    await expect(page.getByRole("button", { name, exact: true })).toBeFocused();
    await page.getByRole("button", { name: `Actions for ${name}`, exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Edit Agent", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  },
);
