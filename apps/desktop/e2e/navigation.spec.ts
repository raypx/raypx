import { registerTests } from "@raypx/e2e/journeys/navigation";
import { desktop, test } from "@raypx/e2e/testing";
import { expect } from "@playwright/test";

registerTests();

test("keeps window commands clear of native title bar insets", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 620 });
  await page.goto(`${desktop}/`);
  const header = page.getByRole("banner");
  const sidebar = page.getByRole("complementary");
  const collapse = header.getByRole("button", { name: "Collapse sidebar" });
  const search = header.getByRole("button", { name: "Search", exact: true });
  const newSession = header.getByRole("link", { name: "New session", exact: true });
  await expect(collapse).toBeVisible();
  await expect(search).toBeVisible();
  await expect(newSession).toHaveAttribute("href", /[?&]compose=true/);

  // The browser preview can check layout against MyGo's CSS inputs.
  for (const insets of [
    { left: 70, right: 0 },
    { left: 0, right: 138 },
  ]) {
    await page.evaluate(({ left, right }) => {
      const { style } = document.documentElement;
      style.setProperty("--mygo-titlebar-height", "48px");
      style.setProperty("--mygo-titlebar-inset-left", `${left}px`);
      style.setProperty("--mygo-titlebar-inset-right", `${right}px`);
    }, insets);
    expect((await header.boundingBox())!.x).toBe(0);
    expect((await header.boundingBox())!.width).toBe(800);
    expect((await collapse.boundingBox())!.x).toBeGreaterThan(insets.left);
    expect((await sidebar.boundingBox())!.y).toBe(48);
    await expect(header).toHaveCSS("padding-right", `${Math.max(12, insets.right + 8)}px`);
  }
  await collapse.click();
  await expect(header.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await search.click();
  const palette = page.getByRole("dialog", { name: "Search", exact: true });
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
});
