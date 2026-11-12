import { expect, type Page } from "@playwright/test";
import { test } from "./browser-fixture.js";
import { web, desktop } from "./surfaces.js";

export async function expectPrivatePages(page: Page, surface: "Web" | "Desktop", reads: string[]) {
  const base = surface === "Web" ? web : desktop;
  for (const [feature, path] of [
    ["memory", surface === "Desktop" ? "/memory?scope=account" : "/memory"],
    ["cloud schedules", surface === "Desktop" ? "/automations?scope=cloud" : "/automations"],
  ] as const) {
    await test.step(`${feature}: no private reads and exact login return path`, async () => {
      await page.goto(base + path);
      const login = page.getByRole("link", { name: "Sign in", exact: true }).last();
      await expect(login).toBeVisible();
      expect(reads).toEqual([]);
      if (surface === "Desktop" && feature === "cloud schedules") {
        await expect(page.getByRole("tab", { name: "Cloud", exact: true })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        await page.getByRole("tab", { name: "This computer", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Automations", exact: true })).toBeVisible();
        await page.getByRole("tab", { name: "Cloud", exact: true }).click();
      }
      await login.click();
      await expect(page).toHaveURL(/\/login\?returnTo=/);
      expect(new URL(page.url()).searchParams.get("returnTo")).toBe(path);
      expect(reads).toEqual([]);
    });
  }
}
