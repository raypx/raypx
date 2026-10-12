import { expect, test, type Page } from "@playwright/test";
import { accounts, password } from "../database.js";

const api = `http://127.0.0.1:${Number(process.env.VOIDMIX_E2E_PORT ?? 3000) + 2}`;
async function login(page: Page, account: keyof typeof accounts = "admin") {
  const response = await page.request.post(`${api}/api/auth/sign-in/email`, {
    data: { email: accounts[account].email, password },
    headers: { origin: api },
  });
  expect(response.ok()).toBe(true);
}

test("empty list, failed create retains draft, pending submit and real retry", async ({
  page,
}, info) => {
  await login(page, "pilot");
  await page.goto("/projects");
  await expect(
    page.getByText("Create your first project to get started.", { exact: true }),
  ).toBeVisible();
  const trigger = page.getByRole("button", { name: "New project", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  const input = dialog.getByLabel("Project title");
  const title = "Pilot project " + "LongTitle".repeat(30);
  await input.fill(title);
  await page.route(
    "**/rpc/projects/create**",
    (route) => route.fulfill({ status: 503, body: "Unavailable" }),
    { times: 1 },
  );
  await input.press("Enter");
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(input).toHaveValue(title);
  await page.screenshot({ path: info.outputPath("create-failure.png") });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  await page.route("**/rpc/projects/create**", async (route) => {
    writes++;
    await gate;
    await route.continue();
  });
  await input.press("Enter");
  await expect(dialog.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  expect(writes).toBe(1);
  release();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  expect(
    await page
      .locator("html")
      .evaluate((node) => node.scrollWidth <= node.ownerDocument.defaultView!.innerWidth),
  ).toBe(true);
});

test("cancel a pending list navigation and preserve the destination", async ({ page }) => {
  await login(page);
  await page.goto("/projects/e2e-project-001");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rpc/projects/list**", async (route) => {
    await gate;
    await route.continue().catch(() => undefined);
  });
  const request = page.waitForRequest("**/rpc/projects/list**");
  await page
    .getByRole("navigation", { name: "Navigation" })
    .getByRole("link", { name: "Projects", exact: true })
    // Isolate navigation from the independent, non-cancelled hover preload.
    .dispatchEvent("click");
  await request;
  const failed = page.waitForEvent("requestfailed", {
    predicate: (request) => request.url().includes("/rpc/projects/list"),
    timeout: 5_000,
  });
  await expect(page.getByRole("status", { name: "Loading…" })).toBeVisible();
  await page.getByRole("link", { name: "User management", exact: true }).click();
  await failed;
  release();
  await expect(page.getByRole("heading", { name: "User directory", exact: true })).toBeVisible();
  await expect(page.locator(".workbench-shell")).toBeVisible();
});

test("list failure has a real retry and an expired session returns to login", async ({ page }) => {
  await login(page, "member");
  await page.goto("/projects/e2e-member-project");
  await page.route("**/rpc/projects/list**", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page
    .getByRole("navigation", { name: "Navigation" })
    .getByRole("link", { name: "Projects", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("could not be loaded");
  await expect(page.getByRole("link", { name: /Member private film/ })).toHaveCount(0);
  await page.unroute("**/rpc/projects/list**");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("link", { name: /Member private film/ })).toBeVisible();
  await page.context().clearCookies();
  await page.reload();
  await expect(page).toHaveURL(/\/login\?redirect=/);
});

for (const scenario of [
  { width: 375, locale: "zh", theme: "dark" },
  { width: 768, locale: "en", theme: "light" },
  { width: 1280, locale: "zh", theme: "light" },
  { width: 1440, locale: "en", theme: "dark" },
] as const) {
  test(`neutral workbench focus, portal theme and containment at ${scenario.width}/${scenario.locale}/${scenario.theme}`, async ({
    page,
    baseURL,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: scenario.width, height: 900 });
    await page.context().addCookies([{ name: "locale", value: scenario.locale, url: baseURL! }]);
    await page.emulateMedia({ colorScheme: scenario.theme, reducedMotion: "reduce" });
    await login(page, "member");
    await page.goto("/projects");
    await expect(page.locator(".project-row").first()).toBeVisible();
    if (scenario.width >= 768) await expect(page.locator('[data-slot="logo-mark"]')).toBeVisible();
    expect(
      await page
        .locator("html")
        .evaluate((node) => node.scrollWidth <= node.ownerDocument.defaultView!.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath("projects.png") });
    const name = scenario.locale === "en" ? "New project" : "新建项目";
    const trigger = page.getByRole("button", { name, exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name });
    await expect(dialog.getByRole("textbox")).toBeFocused();
    const scopeColor = await page
      .locator(".workbench-shell")
      .evaluate((node) =>
        node.ownerDocument.defaultView!.getComputedStyle(node).getPropertyValue("--primary").trim(),
      );
    expect(
      await dialog.evaluate((node) =>
        node.ownerDocument.defaultView!.getComputedStyle(node).getPropertyValue("--primary").trim(),
      ),
    ).toBe(scopeColor);
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((node) => node.contains(node.ownerDocument.activeElement))).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath("dialog.png") });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    if (scenario.width < 768) {
      const open = page.getByRole("button", { name: "打开导航" });
      await open.click();
      await expect(page.getByRole("dialog", { name: "导航" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(open).toBeFocused();
      await open.click();
    }
    await page
      .getByRole("button", {
        name: scenario.locale === "en" ? "Open account menu" : "打开账户菜单",
      })
      .filter({ visible: true })
      .click();
    const menu = page.getByRole("menu");
    expect(
      await menu.evaluate((node) =>
        node.ownerDocument.defaultView!.getComputedStyle(node).getPropertyValue("--primary").trim(),
      ),
    ).toBe(scopeColor);
    await page.screenshot({ path: info.outputPath("account-menu.png") });
    expect(errors).toEqual([]);
  });
}
