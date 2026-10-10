import { test, expect } from "playwright/test";

test("built consumer renders providers, hooks, themed CSS and portalled controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/health", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", service: "raypx-api" }),
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Independent consumer" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Connection" })).toHaveText("connected");
  await page.getByRole("textbox", { name: "Search" }).fill("built packages");
  await expect(page.getByRole("status", { name: "Debounced value" })).toHaveText("built packages");
  const themeButton = page.getByRole("button", { name: "Toggle theme" });
  const light = await themeButton.evaluate((button) => getComputedStyle(button).backgroundColor);
  expect(light).not.toBe("rgba(0, 0, 0, 0)");
  await themeButton.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const dark = await themeButton.evaluate((button) => getComputedStyle(button).backgroundColor);
  expect(dark).not.toBe(light);
  const trigger = page.getByRole("button", { name: "Open dialog" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Consumer dialog" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Dialog input" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});
