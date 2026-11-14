import { expect } from "@playwright/test";
import { capture, test, web } from "@raypx/e2e/testing";

test("reviews current product facts beside login and signup in both languages", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const mode of ["login", "signup"]) {
    await page.goto(`${web}/${mode}`);
    for (const locale of ["en", "zh"]) {
      if (locale === "zh") {
        await page.getByRole("button", { name: "Language", exact: true }).click();
        await page.getByRole("menuitemradio", { name: "简体中文", exact: true }).click();
      }
      const title =
        locale === "en" ? "Come back to work that remembers." : "回来，接着上次的工作。";
      for (const width of [1440, 1024, 768, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
        if (mode === "signup") {
          await expect(
            page.getByText(
              locale === "en"
                ? "Create an account for your Agents and shared Spaces."
                : "创建账号，开始使用智能体与共享空间。",
              { exact: true },
            ),
          ).toBeVisible();
          await expect(page.getByText(/connected projects|已连接的项目/)).toHaveCount(0);
        }
        const facts = page.getByRole("complementary");
        if (width >= 1024) {
          await expect(facts.getByRole("heading", { name: title, exact: true })).toBeVisible();
          await expect(facts.getByRole("listitem")).toHaveCount(3);
        } else await expect(facts).toBeHidden();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await capture(page, {
          path: test.info().outputPath(`followup-${mode}-${locale}.png`),
          fullPage: true,
        });
      }
    }
    await page.getByRole("button", { name: "语言", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "English", exact: true }).click();
  }
});
