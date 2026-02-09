import { expect, test } from "@playwright/test";

/**
 * Homepage end-to-end tests
 */
test.describe("Homepage", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to homepage
    await page.goto("/");
    // Wait for page content to load
    await page.waitForLoadState("domcontentloaded");
    // Wait a bit for React components to render
    await page.waitForTimeout(500);
  });

  test("should be able to access homepage", async ({ page }) => {
    // Check page URL
    await expect(page).toHaveURL("/");

    // Check page title
    await expect(page).toHaveTitle(/Raypx/i);
  });

  test("page should load normally", async ({ page }) => {
    // Check if page body exists
    const body = page.locator("body");
    await expect(body).toBeVisible();

    // Check if page has content
    const content = page.locator("body").first();
    await expect(content).toBeVisible();
  });

  test("should display Hero Section", async ({ page }) => {
    // Wait for h1 element to appear (using waitFor instead of expect)
    const heading = page.locator("h1").first();
    await heading.waitFor({ state: "visible", timeout: 15000 });

    // Verify element is visible
    await expect(heading).toBeVisible();

    // Check heading content
    const headingText = await heading.textContent();
    expect(headingText).toBeTruthy();
    expect(headingText?.trim().length).toBeGreaterThan(0);
  });

  test("should display CTA buttons", async ({ page }) => {
    // Wait for page content to render
    await page.waitForTimeout(1000);

    // Find buttons with more flexible selector
    // Try to find links or buttons containing specific text
    const buttonSelector = page.locator("a, button").filter({
      hasText: /Get Started|View on GitHub|GitHub|开始/i,
    });

    // Wait for at least one button to appear
    await expect(buttonSelector.first()).toBeVisible({ timeout: 15000 });

    // Verify button count
    const count = await buttonSelector.count();
    expect(count).toBeGreaterThan(0);

    // Verify first button is visible and interactive
    const firstButton = buttonSelector.first();
    await expect(firstButton).toBeVisible();
    await expect(firstButton).toBeEnabled();
  });

  test("should display Features Section", async ({ page }) => {
    // Scroll to Features section (usually below the fold)
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });

    await page.waitForTimeout(500);

    // Check if there are feature cards or feature titles
    const features = page.locator("section, [class*='feature'], [class*='card']");
    const count = await features.count();

    // Should have at least some content
    expect(count).toBeGreaterThan(0);
  });

  test("should be able to scroll page", async ({ page }) => {
    // Get initial scroll position
    const initialScrollY = await page.evaluate(() => window.scrollY);

    // Scroll to bottom of page
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Wait for scroll to complete
    await page.waitForTimeout(500);

    // Verify page can scroll
    const finalScrollY = await page.evaluate(() => window.scrollY);
    expect(finalScrollY).toBeGreaterThan(initialScrollY);
  });

  test("page should be responsive - mobile", async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);

    const body = page.locator("body");
    await expect(body).toBeVisible();

    // Check mobile layout
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
  });

  test("page should be responsive - desktop", async ({ page }) => {
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(300);

    const body = page.locator("body");
    await expect(body).toBeVisible();

    // Check desktop layout
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
  });
});

test.describe("Homepage Interactions", () => {
  test("should not have critical console errors after page load", async ({ page }) => {
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check for critical console errors (excluding expected warnings)
    const criticalErrors = errors.filter(
      (error) =>
        !error.includes("favicon") &&
        !error.includes("sourcemap") &&
        !error.includes("404") &&
        !error.includes("ResizeObserver"),
    );

    expect(criticalErrors.length).toBe(0);
  });

  test("page should have correct meta information", async ({ page }) => {
    await page.goto("/");

    // Check page title
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test("should be able to click CTA buttons", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Find "Get Started" or "View on GitHub" buttons
    const getStartedButton = page
      .locator("a, button")
      .filter({ hasText: /Get Started|开始|查看文档/i })
      .first();

    const githubButton = page
      .locator("a, button")
      .filter({ hasText: /GitHub|github/i })
      .first();

    // At least one CTA button should be visible
    const getStartedVisible = await getStartedButton.isVisible().catch(() => false);
    const githubVisible = await githubButton.isVisible().catch(() => false);

    expect(getStartedVisible || githubVisible).toBe(true);

    // If Get Started button exists, verify it's clickable
    if (getStartedVisible) {
      await expect(getStartedButton).toBeVisible();
      await expect(getStartedButton).toBeEnabled();
    }
  });
});
