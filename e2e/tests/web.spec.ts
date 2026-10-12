import { expect, test } from "@playwright/test";

test("renders the public workspace home", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Voidmix/);
  await expect(page.getByRole("heading", { name: /From questions to usable work/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open Voidmix/i }).first()).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`switches and remembers the home language at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");

    await page.getByRole("button", { name: "Language: English" }).click();
    await page.getByRole("menuitemradio", { name: "简体中文" }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
    await expect(page.getByRole("heading", { name: /从问题开始，交付可用成果。/ })).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
    await page.getByRole("button", { name: "语言: 简体中文" }).click();
    await page.getByRole("menuitemradio", { name: "English" }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("heading", { name: /From questions to usable work/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Language: English" })).toBeVisible();
  });
}

test("redirects unauthenticated project access to sign in", async ({ page }) => {
  await page.goto("/projects");

  await expect(page).toHaveURL(/\/login\?redirect=%2Fprojects/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
]) {
  test(`keeps the home footer stable during hydration at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /From questions to usable work/i }),
    ).toBeVisible();
  });
}
