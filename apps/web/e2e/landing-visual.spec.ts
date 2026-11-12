import { expect } from "@playwright/test";
import { capture, test, web } from "@raypx/e2e/testing";

test("Web homepage lets visitors explore the workflow and open draft help", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(web + "/");

  const preview = page.getByRole("figure", { name: "Interactive example" });
  const steps = preview.getByRole("tablist", { name: "Example workflow" });
  const autoplay = preview.getByRole("button", { name: "Autoplay demo", exact: true });
  await expect(autoplay).toHaveAttribute("aria-pressed", "false");
  await expect(preview.getByRole("tabpanel", { name: /^Review\b/ })).toBeVisible();
  await capture(page, {
    path: test.info().outputPath("home-mobile.png"),
    fullPage: true,
  });

  await autoplay.click();
  await expect(autoplay).toHaveAttribute("aria-pressed", "true");
  const session = steps.getByRole("tab", { name: "Session", exact: true });
  await session.click();
  await expect(preview.getByRole("tabpanel", { name: /^Session\b/ })).toBeVisible();
  await expect(autoplay).toHaveAttribute("aria-pressed", "false");

  await session.press("End");
  const result = steps.getByRole("tab", { name: "Result", exact: true });
  await expect(result).toBeFocused();
  await result.press("Enter");
  await expect(preview.getByRole("tabpanel", { name: /^Result\b/ })).toBeVisible();

  const privacy = page.getByRole("button", { name: "Draft privacy", exact: true });
  await privacy.press("Enter");
  const help = page.getByRole("dialog");
  await expect(help).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect(privacy).toBeFocused();
});
