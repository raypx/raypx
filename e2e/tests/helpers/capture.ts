import { expect, type Page } from "@playwright/test";

/** Keep review screenshots opt-in; Playwright captures failures independently. */
export async function capture(page: Page, options: Parameters<Page["screenshot"]>[0]) {
  if (process.env.RAYPX_E2E_SCREENSHOTS !== "1") return;
  await expect(
    page.locator('[data-slot="collapsible-content"][data-open][data-starting-style]'),
  ).toHaveCount(0);
  await page.screenshot({ animations: "disabled", ...options });
}
