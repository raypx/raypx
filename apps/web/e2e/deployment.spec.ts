import { expect } from "@playwright/test";
import { test } from "@raypx/e2e/testing";

test("shows one updating state for an incompatible API and recovers automatically", async ({
  page,
  base,
}) => {
  let compatible = false;
  await page.clock.install();
  await page.route("**/api/rpc/configuration/public", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        json: {
          siteName: "Raypx",
          registrationEnabled: true,
          bootstrap: false,
          setupTokenRequired: false,
          mailConfigured: true,
          ...(compatible ? { ingressVersion: 1 } : {}),
        },
      }),
    }),
  );
  await page.goto(base + "/");
  await expect(
    page.getByRole("heading", { name: "This deployment is being updated" }),
  ).toBeVisible();
  compatible = true;
  await page.clock.fastForward(30_001);
  await expect(
    page.getByRole("heading", { name: "This deployment is being updated" }),
  ).toBeHidden();
  await expect(page.getByRole("banner")).toBeVisible();
});
