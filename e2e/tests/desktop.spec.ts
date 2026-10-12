import { expect, test } from "@playwright/test";
import { accounts, password } from "../database.js";

test("navigates Desktop and preserves settings, theme and keyboard controls", async ({ page }) => {
  const api = `http://127.0.0.1:${Number(process.env.VOIDMIX_E2E_PORT ?? 3000) + 2}`;
  const signedIn = await page.request.post(`${api}/api/auth/sign-in/email`, {
    data: { email: accounts.member.email, password },
    headers: { origin: api },
  });
  expect(signedIn.ok()).toBe(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your workbench" })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  await navigation.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("textbox", { name: "Project folder", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Settings" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(navigation.getByRole("link", { name: "Home", exact: true })).not.toHaveClass(
    /active/,
  );
  await page.getByRole("main").getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("main").getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const toggle = page.getByRole("switch", { name: "Start with the system" });
  await expect(toggle).toBeDisabled();
  const preferenceHelp = page.getByRole("button", { name: "About Sync behavior", exact: true });
  await preferenceHelp.click();
  await expect(
    page
      .getByRole("dialog", { name: "About Sync behavior" })
      .getByText(
        "Unavailable: this preference is saved locally, but its runtime is not connected.",
      ),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preferenceHelp).toBeFocused();
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
  await expect(page.getByRole("textbox", { name: "Project folder", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Settings" })).toHaveClass(/active/);
});
