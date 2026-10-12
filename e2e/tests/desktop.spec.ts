import { expect, test } from "@playwright/test";
import { accounts, password } from "../database.js";

test("opens Desktop projects and preserves theme, locale and keyboard controls", async ({
  page,
}) => {
  const api = `http://127.0.0.1:${Number(process.env.VOIDMIX_E2E_PORT ?? 3000) + 2}`;
  const signedIn = await page.request.post(`${api}/api/auth/sign-in/email`, {
    data: { email: accounts.member.email, password },
    headers: { origin: api },
  });
  expect(signedIn.ok()).toBe(true);
  await page.goto("/");
  await expect(page).toHaveURL(/\/projects\/?$/);
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(navigation.getByRole("link")).toHaveCount(2);
  await navigation.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Settings" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(navigation.getByRole("link", { name: "Projects" })).not.toHaveClass(/active/);
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("main").getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("main").getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  await page.reload();
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  const collapse = page.getByRole("button", { name: "Collapse navigation" });
  await collapse.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Expand navigation" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Expand navigation" }).click();
  await navigation.getByRole("link", { name: "Projects" }).click();
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Projects" })).toHaveClass(/active/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Settings" })).toHaveClass(/active/);
});
