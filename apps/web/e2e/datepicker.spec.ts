import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import {
  test,
  web,
  capture,
  signedInAccount,
  accountAccessFixture,
  authResponse,
} from "@raypx/e2e/testing";

const directory = fileURLToPath(new URL("../../../.artifacts/datepicker/", import.meta.url));
test.use({
  viewport: { width: 1440, height: 860 },
  reducedMotion: "reduce",
  timezoneId: "America/Los_Angeles",
  trace: "off",
  video: "off",
});
for (const locale of ["en", "zh"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`audit date picker ${locale} ${theme}`, { tag: "@web" }, async ({ page }) => {
      await mkdir(directory, { recursive: true });
      await page.clock.setFixedTime(new Date("2026-11-15T00:30:00.000Z"));
      // Exercise UTC date boundaries from a browser whose local date is different near midnight.
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript(
        ({ language }) => {
          localStorage.setItem("raypx_locale", language);
          localStorage.setItem("raypx_theme", "system");
        },
        { language: locale },
      );
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const account = await signedInAccount(page);
      await accountAccessFixture(page, account.id, "admin");
      const reads: { from: string; to: string }[] = [];
      await page.route("**/api/rpc/admin/audit", (route) => {
        if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
        reads.push(route.request().postDataJSON().json);
        return authResponse(route, {
          json: {
            entries: [
              {
                id: "00000000-0000-4000-8000-000000000001",
                requestId: "date-picker-review",
                actorId: account.id,
                source: "http",
                action: "configuration.update",
                targetId: "site",
                startedAt: "2026-11-14T16:35:00.000Z",
                completedAt: "2026-11-14T16:35:01.000Z",
                outcome: "success",
                errorCode: null,
                before: null,
                after: null,
              },
            ],
            next: null,
          },
        });
      });
      await page.goto(web);
      expect(await page.evaluate(() => new Date().getDate())).toBe(14);
      await page
        .getByRole("button", { name: locale === "en" ? "Account menu" : "账号菜单", exact: true })
        .press("Enter");
      await page
        .getByRole("menuitem", {
          name: locale === "en" ? "Admin console" : "管理控制台",
          exact: true,
        })
        .press("Enter");
      await page
        .getByRole("link", { name: locale === "en" ? "Audit log" : "操作审计", exact: true })
        .click();
      const trigger = page.getByRole("button", {
        name: locale === "en" ? "Date range (UTC)" : "日期范围 (UTC)",
        exact: true,
      });
      await expect.poll(() => reads.length).toBeGreaterThan(0);
      expect(reads[0]).toMatchObject({
        from: "2026-10-16T00:00:00.000Z",
        to: "2026-11-16T00:00:00.000Z",
      });
      await trigger.click();
      await page
        .getByRole("button", { name: locale === "en" ? "Go to the Next Month" : "前往下个月" })
        .click();
      await page.locator('button[data-day="2026-11-03"]').click();
      await page.locator('button[data-day="2026-11-06"]').click();
      await expect(page.getByRole("grid")).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page
        .getByRole("button", { name: locale === "en" ? "Apply filters" : "应用筛选" })
        .click();
      await expect
        .poll(() => reads.at(-1))
        .toMatchObject({ from: "2026-11-03T00:00:00.000Z", to: "2026-11-07T00:00:00.000Z" });
      await trigger.press("Enter");
      await expect(page.getByRole("grid")).toHaveAccessibleName(
        locale === "en" ? "November 2026" : "2026年11月",
      );
      await expect(page.locator('button[data-day="2026-11-03"]')).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(page.locator('button[data-day="2026-11-04"]')).toBeFocused();
      await expect(page.locator('[data-slot="popover-content"]')).toHaveCSS(
        "transition-duration",
        "0s",
      );
      await expect(
        page.locator(
          'input[type="date"], input[type="datetime-local"], input[type="month"], input[type="week"], input[type="time"]',
        ),
      ).toHaveCount(0);
      await capture(page, { path: `${directory}/${theme}-${locale}-audit.png` });
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await page.setViewportSize({ width: 390, height: 844 });
      await trigger.click();
      await expect(page.getByRole("grid")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await capture(page, { path: `${directory}/${theme}-${locale}-390-audit.png` });
      expect(errors).toEqual([]);
    });
  }
}
