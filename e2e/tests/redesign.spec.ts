import { expect, test, type Page } from "@playwright/test";
import { accounts, password } from "../database.js";
const port = Number(process.env.VOIDMIX_E2E_PORT ?? 3000);
const api = `http://127.0.0.1:${port + 2}`;
async function login(page: Page, account: keyof typeof accounts = "admin") {
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
  await expect(page.getByText("Admin film 001", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "User management", exact: true })).toHaveCount(0);
});

test("Desktop creates a long project and task through the real API at minimum width", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await login(page, "member");
  await page.goto(`http://127.0.0.1:${port + 1}/projects`);
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
  await page.goto(`http://127.0.0.1:${port + 1}/`);
  await expect(page.getByRole("status")).toHaveText("Account unavailable");
  await expect(page.getByText("12,846", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Preview account", { exact: true })).toHaveCount(0);
  await page.goto(`http://127.0.0.1:${port + 1}/devices`);
  await expect(page.getByRole("status")).toHaveText("Account unavailable");
  await expect(page.locator(".device-row")).toHaveCount(0);
  await page.goto(`http://127.0.0.1:${port + 1}/projects`);
  await expect(page.getByRole("status")).toHaveText("Account unavailable");
  await page.screenshot({
    caret: "initial",
    path: info.outputPath("desktop-connection-failure.png"),
  });
  await page.unroute(unavailable);
  await page.reload();
  await expect(page.getByRole("link", { name: /Admin film/ }).first()).toBeVisible();
  await page.route("**/rpc/projects/list**", (route) => route.abort("connectionrefused"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Projects are unavailable" })).toBeVisible();
  await page.unroute("**/rpc/projects/list**");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("link", { name: /Admin film/ }).first()).toBeVisible();
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
    for (const route of ["/projects", "/projects/e2e-project-001", "/admin"]) {
      await page.goto(route);
      await expect(page.locator("#main-content")).toBeVisible();
      await contained(page);
      await page.screenshot({
        caret: "initial",
        path: info.outputPath(`app-${route.split("/").pop()}.png`),
        fullPage: route !== "/admin",
      });
    }
    const select = page.getByRole("checkbox", {
      name: scenario.locale === "en" ? "Select all users" : "选择全部用户",
    });
    await select.check();
    await expect(
      page.getByRole("button", {
        name: scenario.locale === "en" ? "Suspend selected" : "停用所选用户",
      }),
    ).toBeVisible();
    if (scenario.width < 768) {
      const selectionTarget = await select.locator("..").boundingBox();
      expect(selectionTarget?.width).toBeGreaterThanOrEqual(44);
      expect(selectionTarget?.height).toBeGreaterThanOrEqual(44);
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
for (const scenario of [
  { width: 800, locale: "zh", theme: "dark" },
  { width: 1120, locale: "en", theme: "light" },
  { width: 1440, locale: "zh", theme: "light" },
] as const) {
  test(`Desktop layouts at ${scenario.width} / ${scenario.locale} / ${scenario.theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: scenario.width, height: 800 });
    await page.addInitScript(({ locale, theme }) => {
      localStorage.setItem("voidmix_locale", locale);
      localStorage.setItem(
        "voidmix.desktop.preferences",
        JSON.stringify({ state: { theme }, version: 1 }),
      );
    }, scenario);
    await page
      .context()
      .addCookies([
        { name: "locale", value: scenario.locale, url: `http://127.0.0.1:${port + 1}` },
      ]);
    await login(page);
    for (const route of [
      "/",
      "/projects",
      "/projects/e2e-project-001",
      "/activity",
      "/settings",
      "/devices",
    ]) {
      await page.goto(`http://127.0.0.1:${port + 1}${route}`);
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
