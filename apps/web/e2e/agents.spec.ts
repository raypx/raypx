import { expect, test, type Page } from "@playwright/test";
import { selectOption } from "@raypx/e2e/testing";

const apiUrl = process.env.CONTROL_E2E_API_URL;

async function expectConversationGeometry(page: Page, name: string, sheetOpen = false) {
  // DOM locators also measure the conversation while the modal sheet makes it inert.
  const pane = page.locator('section[aria-label="Conversation"]');
  const heading = pane.locator("header h2");
  const sender = pane.locator("article h3[title]").first();
  const bubble = sender.locator("xpath=following-sibling::div[1]");
  await expect(heading).toHaveText(name);
  const paneBox = await pane.boundingBox();
  const headingBox = await heading.boundingBox();
  const senderBox = await sender.boundingBox();
  const bubbleBox = await bubble.boundingBox();
  expect(headingBox!.x).toBeGreaterThanOrEqual(paneBox!.x);
  expect(headingBox!.x + headingBox!.width).toBeLessThanOrEqual(paneBox!.x + paneBox!.width);
  expect(senderBox!.x).toBeGreaterThanOrEqual(bubbleBox!.x);
  expect(senderBox!.x + senderBox!.width).toBeLessThanOrEqual(bubbleBox!.x + bubbleBox!.width);
  await expect(sender).toHaveText(name);
  await expect(sender).toHaveCSS("text-overflow", "ellipsis");
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
    const indicator = pane.getByRole("button", { name: "Computer: Running", exact: true });
    await expect(indicator).toBeVisible();
    expect(await indicator.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    const status = indicator.getByText("Running", { exact: true });
    expect(await status.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(sender).toHaveAccessibleName(name);
  }
  for (const selector of ["[data-approval-card]", "[data-tool-activity]"]) {
    const row = pane.locator(selector).first();
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
    const computer = page.getByRole("button", { name: /^Computer:/ });
    await expect(computer).toBeVisible();
    await computer.click();
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
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    await page.reload();
    await expect(approval).toBeVisible();
    await expect(editor).toHaveValue("A draft while approval is pending");
    await expect(page.getByText(writePrompt, { exact: true })).toHaveCount(1);
    await editor.fill("");
    const activity = page.locator("[data-tool-activity]").first();
    const activityToggle = activity.getByRole("button", { name: /tool requests?/ });
    await expect(activityToggle).toHaveAttribute("aria-expanded", "false");
    await activityToggle.click();
    await expect(activityToggle).toHaveAttribute("aria-expanded", "true");
    await expect(activity.getByText("Write a file", { exact: true })).toBeVisible();
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
    await expect(approval.getByText("Approved", { exact: true })).toBeVisible();
    await expect(page.getByText("Fixture reply", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop reply", exact: true })).toBeVisible();
    const finishWrite = await page.request.post(`${apiUrl}/fixture/conversation/complete`, {
      headers: { origin: "http://127.0.0.1:4173" },
    });
    expect(finishWrite.status()).toBe(204);
    await expect(page.getByText("Fixture reply completed.", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Stop reply", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(writePrompt, { exact: true })).toHaveCount(1);
    await expect(page.getByText("Fixture reply completed.", { exact: true })).toHaveCount(2);
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
