import { test, expect } from "./fixtures";

test("home hydrates with one successful health request", async ({ page }, testInfo) => {
  let requests = 0;
  let successful = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/health") requests++;
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/health" && response.ok()) successful++;
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Raypx", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Backend connected");
  expect(successful).toBe(1);
  // TanStack's development StrictMode may abort the first observer's request.
  expect(requests).toBeLessThanOrEqual(testInfo.project.name === "dev" ? 2 : 1);
});

test("client navigation and browser history return home", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Backend connected");
  await page.getByRole("link", { name: "Explore components" }).click();
  await expect(page.getByRole("heading", { name: "UI components", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Color theme" }).click();
  await page.getByRole("option", { name: "Dark theme" }).click();
  // A direct request must also SSR the existing component page.
  const refreshed = await page.reload();
  expect(refreshed?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "UI components", exact: true })).toBeVisible();
  // SSR renders the system snapshot; restored select text confirms client hydration.
  await expect(page.getByRole("combobox", { name: "Color theme" })).toHaveText("Dark theme");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Raypx", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Explore components" }).click();
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page.getByRole("status")).toHaveText("Backend connected");
});

test("theme preferences persist and system mode follows the browser", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Backend connected");
  await page.getByRole("combobox", { name: "Color theme" }).click();
  await page.getByRole("option", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("status")).toHaveText("Backend connected");
  await page.getByRole("combobox", { name: "Color theme" }).click();
  await page.getByRole("option", { name: "Light theme" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("combobox", { name: "Color theme" }).click();
  await page.getByRole("option", { name: "System theme" }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("component form submits without navigation and announces a toast", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Backend connected");
  await page.getByRole("link", { name: "Explore components" }).click();
  await page.getByRole("textbox", { name: "Workspace name", exact: true }).fill("E2E workspace");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(page.getByText("Preferences preview saved", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/components$/);
});

test("dialog portal supports keyboard dismissal and restores focus", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Backend connected");
  await page.getByRole("link", { name: "Explore components" }).click();
  const trigger = page.getByRole("button", { name: "Edit workspace", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Edit workspace" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Workspace name", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("failed health check recovers through the retry action", async ({ page }, testInfo) => {
  let attempts = 0;
  let healthy = false;
  await page.route("**/api/health", async (route) => {
    attempts++;
    await route.fulfill({
      status: healthy ? 200 : 500,
      contentType: "application/json",
      body: JSON.stringify(
        !healthy
          ? {
              error: {
                code: "INTERNAL_ERROR",
                message: "Internal server error",
                requestId: "e2e-error",
              },
            }
          : { status: "ok", service: "raypx-api" },
      ),
    });
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Cannot connect to backend");
  expect(attempts).toBeGreaterThanOrEqual(1);
  expect(attempts).toBeLessThanOrEqual(testInfo.project.name === "dev" ? 2 : 1);
  const initialAttempts = attempts;
  healthy = true;
  await page.getByRole("button", { name: "Retry Connection" }).click();
  await expect(page.getByRole("status")).toHaveText("Backend connected");
  expect(attempts).toBe(initialAttempts + 1);
});

test("unknown pages show 404 and a working home link", async ({ page }) => {
  const response = await page.goto("/e2e-missing-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page Not Found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page.getByRole("status")).toHaveText("Backend connected");
});
