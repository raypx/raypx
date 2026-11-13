import { expect, type Page } from "@playwright/test";
import { test } from "./browser-fixture.js";
import { web } from "./surfaces.js";
import { capture } from "./capture.js";

export async function preferencesPersist(page: Page, base: string) {
  await page.goto(`${base}${base === web ? "/settings" : "/agents#settings"}`);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  if (base === web)
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  else await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
  // The visible theme card activates its visually hidden radio.
  await page.getByText("Dark", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("combobox", { name: "Language", exact: true }).click();
  await page.getByRole("option", { name: "简体中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("combobox", { name: "语言", exact: true })).toContainText("简体中文");
  await expect(page.getByRole("radio", { name: "深色", exact: true })).toBeChecked();
  await capture(page, {
    path: test
      .info()
      .outputPath(base === web ? "web-settings-dark-zh.png" : "desktop-settings-dark-zh.png"),
    fullPage: true,
  });
}
