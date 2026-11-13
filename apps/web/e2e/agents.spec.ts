import { expect, test } from "@playwright/test";
import { selectOption } from "@raypx/e2e/testing";

const apiUrl = process.env.CONTROL_E2E_API_URL;

test(
  "Conversation Agent streams a deterministic reply and preserves history after reload",
  { tag: "@web" },
  async ({ page }) => {
    test.skip(!apiUrl, "Requires the owned backend fixture from bun run test backends --with-e2e");
    const name = `Conversation fixture ${crypto.randomUUID()}`;
    const prompt = `Remember this message ${crypto.randomUUID()}`;
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("http://127.0.0.1:4173/agents");
    await page.getByLabel("Email address", { exact: true }).fill("control-e2e@example.com");
    await page.getByLabel("Password", { exact: true }).fill("Raypx-control-test-123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/agents(?:\?|$)/);
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
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  },
);
