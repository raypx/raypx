import { expect } from "@playwright/test";
import { capture, test, web } from "@raypx/e2e/testing";

test(
  "Web homepage presents the conversation product in both languages and widths",
  { tag: "@web" },
  async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(web + "/");
      await expect(page.getByRole("figure", { name: "Conversation example" })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "What comes next", exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await capture(page, { path: test.info().outputPath(`home-${width}-en.png`), fullPage: true });
      await page.getByRole("button", { name: "Language", exact: true }).click();
      await page.getByRole("menuitemradio", { name: "简体中文", exact: true }).click();
      await expect(page.getByRole("figure", { name: "对话示例" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await capture(page, { path: test.info().outputPath(`home-${width}-zh.png`), fullPage: true });
      await page.getByRole("button", { name: "语言", exact: true }).click();
      await page.getByRole("menuitemradio", { name: "English", exact: true }).click();
    }
  },
);
