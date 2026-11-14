import { expect } from "@playwright/test";
import { capture, test, web } from "@raypx/e2e/testing";

test(
  "Web homepage presents the conversation product in both languages and widths",
  { tag: "@web" },
  async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(web + "/");
      await expect(
        page.getByRole("figure", { name: "Workspace example", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Your deployment. Clear boundaries.", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Choose where the work happens.", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Stay in control of actions.", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Connect the capabilities you choose.", exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/This phase supports conversations without tools/)).toHaveCount(
        0,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await capture(page, {
        path: test.info().outputPath("followup-landing-en.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Language", exact: true }).click();
      await page.getByRole("menuitemradio", { name: "简体中文", exact: true }).click();
      await expect(page.getByRole("figure", { name: "工作空间示例", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await capture(page, {
        path: test.info().outputPath("followup-landing-zh.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "语言", exact: true }).click();
      await page.getByRole("menuitemradio", { name: "English", exact: true }).click();
    }
  },
);
