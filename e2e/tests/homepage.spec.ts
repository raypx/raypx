import { expect, test } from "@playwright/test";
for (const scenario of [
  { width: 390, locale: "zh", theme: "dark" },
  { width: 768, locale: "en", theme: "light" },
  { width: 1280, locale: "zh", theme: "light" },
] as const) {
  test(`cloud homepage, docs and SEO ${scenario.width}/${scenario.locale}/${scenario.theme}`, async ({
    page,
    baseURL,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (/hydrat|server.rendered|didn't match/i.test(message.text())) errors.push(message.text());
    });
    await page.setViewportSize({ width: scenario.width, height: 900 });
    await page.emulateMedia({ colorScheme: scenario.theme, reducedMotion: "reduce" });
    await page.context().addCookies([
      { name: "locale", value: scenario.locale, url: baseURL! },
      { name: "theme", value: scenario.theme, url: baseURL! },
    ]);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      scenario.locale === "en" ? "From questions to usable work." : "从问题开始，交付可用成果。",
    );
    await expect(
      page.getByRole("button", {
        name: scenario.locale === "en" ? "Language: English" : "语言: 简体中文",
      }),
    ).toBeEnabled();
    expect(
      await page
        .locator("html")
        .evaluate((node) => node.scrollWidth <= node.ownerDocument.defaultView!.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath("cloud-home.png"), fullPage: true });
    await page
      .getByRole("link", {
        name: scenario.locale === "en" ? "Documentation" : "使用文档",
        exact: true,
      })
      .first()
      .click();
    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/arbitrary code|任意代码/)).toBeVisible();
    const robots = await page.request.get("/robots.txt");
    expect(await robots.text()).toContain("Disallow: /chat");
    expect(errors).toEqual([]);
  });
}
