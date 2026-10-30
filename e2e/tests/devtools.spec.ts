import { expect, test } from "@playwright/test";
import { capture } from "./helpers/capture.js";

test.beforeEach(async ({ page }) => {
  await page.route("http://127.0.0.1:4399/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
      headers: {
        "access-control-allow-origin": new URL(page.url()).origin,
        "access-control-allow-credentials": "true",
      },
    }),
  );
});

test("opens the official Dock and copies current page metadata without private values", async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/settings?diagnostic=private-search-value");
  await page.waitForFunction(() => Boolean(customElements.get("devframes-dock-embedded")));
  await page.keyboard.press("Shift+Alt+KeyD");
  const logo = page.getByRole("img", { name: "Vite DevTools logo" });
  if (await logo.isVisible()) await logo.hover();
  await page.getByRole("button", { name: "Raypx", exact: true }).click();
  const panel = page.locator("[data-raypx-devtools-panel]");
  await expect(panel).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(panel.getByRole("heading", { name: "Raypx page diagnostics" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Copy diagnostic snapshot" })).toHaveCSS(
    "height",
    "32px",
  );
  await expect(panel.getByRole("button", { name: "Copy diagnostic snapshot" })).toHaveCSS(
    "background-color",
    "oklch(0.205 0 0)",
  );
  await capture(page, { path: testInfo.outputPath("page-diagnostics-light.png") });
  await expect(panel).toContainText("diagnostic");
  await expect(panel).not.toContainText("private-search-value");
  await panel.getByRole("button", { name: "Copy diagnostic snapshot" }).click();
  await expect(panel.getByRole("status")).toHaveText("Snapshot copied");
  await page.bringToFront();
  const json = await page.evaluate(() =>
    Promise.race([
      navigator.clipboard.readText(),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("Clipboard read timed out")), 5000),
      ),
    ]),
  );
  const snapshot = JSON.parse(json);
  expect(snapshot.surface).toBe(testInfo.project.name.startsWith("web") ? "web" : "desktop");
  expect(snapshot.schemaVersion).toBe(1);
  expect(snapshot.route.searchNames).toContain("diagnostic");
  expect(json).not.toContain("private-search-value");
  expect(json).not.toContain("queryHash");
  await panel.getByRole("tab", { name: /Query cache/ }).click();
  await expect(panel.getByRole("tab", { name: /Query cache/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Raypx", exact: true }).click();
  const logoAfterNavigation = page.getByRole("img", { name: "Vite DevTools logo" });
  if (await logoAfterNavigation.isVisible()) await logoAfterNavigation.hover();
  await page.getByRole("button", { name: "Raypx", exact: true }).click();
  await panel.getByRole("button", { name: "Copy diagnostic snapshot" }).click();
  await expect(panel.getByRole("status")).toHaveText("Snapshot copied");
  await page.bringToFront();
  const navigated = JSON.parse(
    await page.evaluate(() =>
      Promise.race([
        navigator.clipboard.readText(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("Clipboard read timed out")), 5000),
        ),
      ]),
    ),
  );
  expect(navigated.route.searchNames).not.toContain("diagnostic");
  expect(navigated.route.matches.at(-1).template).not.toContain("settings");
});

test("keeps Chinese dark mode usable at narrow widths and offers manual copy", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("raypx_locale", "zh");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  await page.waitForFunction(() => Boolean(customElements.get("devframes-dock-embedded")));
  await page.keyboard.press("Shift+Alt+KeyD");
  const logo = page.getByRole("img", { name: "Vite DevTools logo" });
  if (await logo.isVisible()) await logo.hover();
  await page.getByRole("button", { name: "Raypx", exact: true }).click();
  const panel = page.locator("[data-raypx-devtools-panel]");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Raypx 页面诊断" })).toBeVisible();
  await expect(panel).toHaveClass(/dark/);
  await expect(panel).toHaveCSS("background-color", "oklch(0.145 0 0)");
  await panel.getByRole("tab", { name: /查询缓存/ }).click();
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  await page.keyboard.press("ArrowLeft");
  await expect(panel.getByRole("tab", { name: "页面状态" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("tab", { name: "页面状态" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await panel.getByRole("button", { name: "复制诊断快照" }).click();
  const json = panel.getByRole("textbox", { name: "诊断快照 JSON" });
  await expect(json).toBeVisible();
  expect(JSON.parse(await json.inputValue()).schemaVersion).toBe(1);
  expect(
    await json.evaluate(
      (element: HTMLTextAreaElement) => element.selectionEnd === element.value.length,
    ),
  ).toBe(true);
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  await capture(page, { path: testInfo.outputPath("page-diagnostics-dark-zh.png") });
});
