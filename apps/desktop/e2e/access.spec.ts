import { test, desktop, authResponse, signedInAccount } from "@raypx/e2e/testing";
import { expect } from "@playwright/test";

test(
  "Desktop opens Agents after sign-in and gates conversations before private reads",
  { tag: ["@desktop", "@smoke"] },
  async ({ page }) => {
    const privateReads: string[] = [];
    await page.route("**/api/auth/get-session**", (route) => authResponse(route, null));
    page.on("request", (request) => {
      if (/\/rpc\/(spaces|agents|conversations)\//.test(request.url()))
        privateReads.push(request.url());
    });
    await page.goto(`${desktop}/`);
    await expect(page).toHaveURL(`${desktop}/login?returnTo=%2Fagents`);
    await expect(page.getByRole("button", { name: "Sign in with browser" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Language", exact: true })).toBeVisible();
    expect(privateReads).toEqual([]);
  },
);

test(
  "Desktop signs out to login and retains device preferences",
  { tag: ["@desktop", "@smoke"] },
  async ({ page }) => {
    await signedInAccount(page);
    await page.goto(`${desktop}/`);
    await expect(page).toHaveURL(`${desktop}/agents`);
    await expect(
      page.getByRole("heading", { name: "Create a Space to get started.", exact: true }),
    ).toBeVisible();
    await page.route("**/api/auth/sign-out", async (route) => {
      await page.route("**/api/auth/get-session**", (session) => authResponse(session, null));
      return authResponse(route, { success: true });
    });
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(`${desktop}/login`);
    await expect(page.getByRole("button", { name: "Language", exact: true })).toBeVisible();
  },
);
