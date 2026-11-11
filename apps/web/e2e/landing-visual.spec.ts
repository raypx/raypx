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
        autoplay: "Autoplay demo",
      },
      zh: {
        preview: "交互演示",
        steps: "示例工作流",
        session: "会话",
        review: "审阅",
        result: "结果",
        privacy: "草稿与隐私",
        autoplay: "自动播放演示",
      },
    }[view.locale];
    const preview = page.getByRole("figure", { name: labels.preview });
    const stepTab = (name: string) =>
      page.getByRole("tablist", { name: labels.steps }).getByRole("tab", { name, exact: true });
    const panel = () => preview.locator('[role="tabpanel"]:not([inert])');
    await expect(stepTab(labels.review)).toHaveAttribute("aria-selected", "true");
    await expect(panel()).toContainText("await persist(input)");
    // Stop the self-playing example so the manual steps below are deterministic.
    const autoplay = page.getByRole("button", { name: labels.autoplay, exact: true });
    await expect(async () => {
      await autoplay.click();
      await expect(autoplay).toHaveAttribute("aria-pressed", "false", { timeout: 500 });
    }).toPass();
    await expect(stepTab(labels.review)).toHaveAttribute("aria-selected", "true");
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

test("Web homepage ambient motion runs while visible and stops under reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/api/auth/get-session**", (route) => authResponse(route, null));
  await page.route("**/rpc/configuration/public", (route) =>
    authResponse(route, { json: { siteName: "Raypx", registrationEnabled: true } }),
  );
  await page.goto(web + "/");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("aria-hidden", "true");
  const frame = () => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  const first = await frame();
  await expect.poll(frame).not.toBe(first);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("[data-packet]").first()).toHaveCSS("opacity", "0");
  // Media-query listeners redraw the canvas during the next rendering cycle.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const still = await frame();
  await page.waitForTimeout(500);
  expect(await frame()).toBe(still);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test("Web homepage demo plays itself, holds on hover and stops on request", async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/api/auth/get-session**", (route) => authResponse(route, null));
  await page.route("**/rpc/configuration/public", (route) =>
    authResponse(route, { json: { siteName: "Raypx", registrationEnabled: true } }),
  );
  await page.goto(web + "/");
  const showcase = page.locator("[data-autoplay]");
  const steps = page.getByRole("tablist", { name: "Example workflow" });
  const autoplay = page.getByRole("button", { name: "Autoplay demo", exact: true });
  await expect(autoplay).toHaveAttribute("aria-pressed", "true");
  await page.clock.runFor(2_000);
  await expect(showcase).toHaveAttribute("data-autoplay", "playing");
  await page.clock.runFor(5_500);
  await expect(steps.getByRole("tab", { name: "Result", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page
    .getByRole("figure", { name: "Interactive example" })
    .locator("pre, ul")
    .first()
    .hover();
  await expect(showcase).toHaveAttribute("data-autoplay", "paused");
  await page.mouse.move(4, 4);
  await expect(showcase).toHaveAttribute("data-autoplay", "playing");

  await autoplay.click();
  await expect(autoplay).toHaveAttribute("aria-pressed", "false");
  await expect(showcase).toHaveAttribute("data-autoplay", "off");
  const selected = await steps.locator('[aria-selected="true"]').textContent();
  await page.clock.runFor(6_500);
  expect(await steps.locator('[aria-selected="true"]').textContent()).toBe(selected);
});

test("Web homepage demo stays still under reduced motion", async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/api/auth/get-session**", (route) => authResponse(route, null));
  await page.route("**/rpc/configuration/public", (route) =>
    authResponse(route, { json: { siteName: "Raypx", registrationEnabled: true } }),
  );
  await page.goto(web + "/");
  await expect(page.getByRole("button", { name: "Autoplay demo", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator("[data-autoplay]")).toHaveAttribute("data-autoplay", "off");
  await page.clock.runFor(6_500);
  await expect(
    page
      .getByRole("tablist", { name: "Example workflow" })
      .getByRole("tab", { name: "Review", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});
