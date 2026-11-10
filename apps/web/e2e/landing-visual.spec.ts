import { test, web, authResponse, capture } from "@raypx/e2e/testing";
import { expect } from "@playwright/test";

const views = [
  { width: 1440, height: 900, locale: "en", theme: "light" },
  { width: 768, height: 1024, locale: "zh", theme: "dark" },
  { width: 390, height: 844, locale: "en", theme: "light" },
  { width: 360, height: 800, locale: "zh", theme: "dark" },
] as const;

for (const view of views) {
  test(`Web homepage workflow ${view.width}px ${view.locale} ${view.theme}`, async ({ page }) => {
    await page.setViewportSize(view);
    await page.addInitScript(({ locale, theme }) => {
      localStorage.setItem("raypx_locale", locale);
      localStorage.setItem("theme", theme);
    }, view);
    await page.route("**/api/auth/get-session**", (route) => authResponse(route, null));
    await page.route("**/rpc/configuration/public", (route) =>
      authResponse(route, { json: { siteName: "Raypx", registrationEnabled: true } }),
    );
    const privateReads: string[] = [];
    page.on("request", (request) => {
      if (
        /\/rpc\/(tasks|approvals|devices|observed|account|relay|memory|jobs)\//.test(request.url())
      ) {
        privateReads.push(request.url());
      }
    });
    await page.goto(web + "/");
    const labels = {
      en: {
        preview: "Interactive example",
        steps: "Example workflow",
        session: "Session",
        review: "Review",
        result: "Result",
        privacy: "Draft privacy",
      },
      zh: {
        preview: "交互演示",
        steps: "示例工作流",
        session: "会话",
        review: "审阅",
        result: "结果",
        privacy: "草稿与隐私",
      },
    }[view.locale];
    const preview = page.getByRole("figure", { name: labels.preview });
    const stepTab = (name: string) =>
      page.getByRole("tablist", { name: labels.steps }).getByRole("tab", { name, exact: true });
    const panel = () => preview.locator('[role="tabpanel"]:not([inert])');
    await expect(stepTab(labels.review)).toHaveAttribute("aria-selected", "true");
    await expect(panel()).toContainText("await persist(input)");
    const previewHeight = await preview.evaluate((element: HTMLElement) => element.offsetHeight);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await capture(page, {
      path: test.info().outputPath(`home-${view.width}-${view.locale}-${view.theme}.png`),
      fullPage: true,
    });

    await page.evaluate(() => {
      const original = Reflect.get(Element.prototype, "animate");
      const durations: number[] = [];
      Object.assign(window, { landingAnimationDurations: durations });
      Element.prototype.animate = function (keyframes, options) {
        if (this.getAttribute("role") === "tabpanel" && typeof options === "object") {
          durations.push(Number(options.duration));
        }
        return original.call(this, keyframes, options);
      };
    });
    const animationDurations = () =>
      page.evaluate(() => Reflect.get(window, "landingAnimationDurations") as number[]);
    await stepTab(labels.session).click();
    await expect(panel()).toContainText("read src/delivery.ts");
    await expect(preview).toHaveJSProperty("offsetHeight", previewHeight);
    expect(await animationDurations()).toEqual([200]);
    if (view.width === 1440) {
      await capture(page, {
        path: test.info().outputPath("home-session-1440-en-light.png"),
        fullPage: true,
      });
    }

    await stepTab(labels.session).press("End");
    await expect(stepTab(labels.result)).toBeFocused();
    await stepTab(labels.result).press("Enter");
    await expect(stepTab(labels.result)).toHaveAttribute("aria-selected", "true");
    expect(await animationDurations()).toEqual([200]);
    await expect(preview).toHaveJSProperty("offsetHeight", previewHeight);
    if (view.width === 1440 || view.width === 360) {
      await capture(page, {
        path: test.info().outputPath(`home-result-${view.width}-${view.locale}-${view.theme}.png`),
        fullPage: true,
      });
    }

    await page.emulateMedia({ reducedMotion: "reduce" });
    await stepTab(labels.review).click();
    await expect(panel()).toContainText("await persist(input)");
    expect(await animationDurations()).toEqual([200]);
    expect(privateReads).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    const privacy = page.getByRole("button", { name: labels.privacy });
    await privacy.focus();
    await privacy.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    if (view.width === 390) {
      await capture(page, {
        path: test.info().outputPath("home-help-390-en-light.png"),
        fullPage: true,
      });
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(privacy).toBeFocused();
  });
}
