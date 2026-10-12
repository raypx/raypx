import { expect, test, type Page } from "@playwright/test";
import { accounts, password } from "../database.js";
const port = Number(process.env.RAYPX_E2E_PORT ?? 3000);
const api = `http://127.0.0.1:${port + 2}`;
async function login(page: Page, account: keyof typeof accounts = "primary") {
  const response = await page.request.post(`${api}/api/auth/sign-in/email`, {
    data: { email: accounts[account].email, password },
    headers: { origin: api },
  });
  expect(response.ok()).toBe(true);
}

test("Web explains actual project access rejection without leaking the project", async ({
  page,
}) => {
  await login(page, "member");
  await page.goto("/projects/e2e-project-001");
  // The detail loader reads the project and tasks in parallel. Project lookup
  // conceals inaccessible IDs with NOT_FOUND; tasks reject with FORBIDDEN.
  await expect(page.getByRole("alert")).toHaveText(
    /^(The project could not be found\.|Your account does not have permission to view this content\.)$/,
  );
  await expect(page.getByText("Project 001", { exact: true })).toHaveCount(0);
});

async function contained(page: Page) {
  expect(
    await page
      .locator("html")
      .evaluate((node) => node.scrollWidth <= node.ownerDocument.defaultView!.innerWidth),
  ).toBe(true);
  await expect(page.locator("h1").first()).toBeVisible();
}
for (const scenario of [
  { width: 375, locale: "zh", theme: "dark" },
  { width: 768, locale: "en", theme: "light" },
  { width: 1280, locale: "zh", theme: "light" },
  { width: 1440, locale: "en", theme: "dark" },
] as const) {
  test(`Web layouts and controls at ${scenario.width} / ${scenario.locale} / ${scenario.theme}`, async ({
    page,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width: scenario.width, height: 900 });
    await page.context().addCookies([{ name: "locale", value: scenario.locale, url: baseURL! }]);
    await page.emulateMedia({ colorScheme: scenario.theme, reducedMotion: "reduce" });
    for (const route of ["/", "/login", "/signup", "/reset-password", "/verify-email"]) {
      await page.goto(route);
      await contained(page);
      await page.screenshot({
        caret: "initial",
        path: info.outputPath(`public-${route.replaceAll("/", "") || "home"}.png`),
        fullPage: true,
      });
      if (route === "/")
        expect(
          await page
            .locator("img")
            .evaluateAll((images) =>
              images.every((image) => image.complete && image.naturalWidth > 0),
            ),
        ).toBe(true);
    }
    await login(page);
    for (const route of ["/projects", "/projects/e2e-project-001"]) {
      await page.goto(route);
      await expect(page.locator("#main-content")).toBeVisible({ timeout: 15_000 });
      await contained(page);
      await page.screenshot({
        caret: "initial",
        path: info.outputPath(`app-${route.split("/").pop()}.png`),
        fullPage: true,
      });
    }
    if (scenario.width < 768) {
      const trigger = page.getByRole("button", { name: "打开导航" });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "导航" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("link", { name: "项目", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL(/\/projects/);
      await page.getByRole("button", { name: "新建项目" }).click();
      await expect(page.getByRole("dialog", { name: "新建项目" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "新建项目" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "新建项目" })).toBeFocused();
    }
  });
}
