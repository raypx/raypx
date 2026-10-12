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

test("Desktop creates a long project and task through the real API at minimum width", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await login(page, "member");
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const title = "Desktop-" + "VeryLongProjectTitle".repeat(12);
  await page.getByLabel("Project name").fill(title);
  await page.getByLabel("Project name").press("Enter");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page
    .getByLabel("Add a task")
    .fill("Desktop task with a long title " + "持续追踪进度".repeat(25));
  await page.getByLabel("Add a task").press("Enter");
  await expect(
    page.getByRole("listitem").getByText(/^Desktop task with a long title/),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("listitem").getByText(/^Desktop task with a long title/),
  ).toBeVisible();
  await contained(page);
  expect(
    await page.locator(".app-content").evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({ caret: "initial", path: info.outputPath("desktop-long-content.png") });
});

test("Desktop connection failures show no demos and project retry restores real data", async ({
  page,
}, info) => {
  await login(page);
  const unavailable = `${api}/**`;
  await page.route(unavailable, (route) => route.abort("connectionrefused"));
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Account unavailable");
  await expect(page.getByText("12,846", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Preview account", { exact: true })).toHaveCount(0);
  await page.goto("/devices");
  await expect(page.getByRole("status")).toHaveText("Account unavailable");
  await expect(page.locator(".device-row")).toHaveCount(0);
  await page.goto("/projects");
  await expect(page.getByRole("status")).toHaveText("Account unavailable");
  await page.screenshot({
    caret: "initial",
    path: info.outputPath("desktop-connection-failure.png"),
  });
  await page.unroute(unavailable);
  await page.reload();
  await expect(page.getByRole("link", { name: /Project \d{3}/ }).first()).toBeVisible();
  await page.route("**/rpc/projects/list**", (route) => route.abort("connectionrefused"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Projects are unavailable" })).toBeVisible();
  await page.unroute("**/rpc/projects/list**");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("link", { name: /Project \d{3}/ }).first()).toBeVisible();
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
  { width: 800, locale: "zh", theme: "dark" },
  { width: 1120, locale: "en", theme: "light" },
  { width: 1440, locale: "zh", theme: "light" },
] as const) {
  test(`Desktop layouts at ${scenario.width} / ${scenario.locale} / ${scenario.theme}`, async ({
    page,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width: scenario.width, height: 800 });
    await page.addInitScript(({ locale, theme }) => {
      localStorage.setItem("raypx_locale", locale);
      localStorage.setItem(
        "raypx.desktop.preferences",
        JSON.stringify({ state: { theme }, version: 1 }),
      );
    }, scenario);
    await page.context().addCookies([{ name: "locale", value: scenario.locale, url: baseURL! }]);
    await login(page);
    for (const route of [
      "/",
      "/projects",
      "/projects/e2e-project-001",
      "/activity",
      "/settings",
      "/devices",
    ]) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("lang", scenario.locale);
      await expect(page.locator("html")).toHaveAttribute("data-theme", scenario.theme);
      await contained(page);
      await page.screenshot({
        caret: "initial",
        path: info.outputPath(`desktop-${route.split("/").pop() || "home"}.png`),
      });
      expect(
        await page.locator(".app-content").evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
    }
    await expect(page.getByRole("button", { name: /Pair|配对/ })).toHaveCount(0);
  });
}
