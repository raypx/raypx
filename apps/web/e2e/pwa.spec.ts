import { expect } from "@playwright/test";
import { test, web } from "@raypx/e2e/testing";

test("Web quick settings opens the available install prompt and reflects installation", async ({
  page,
}) => {
  await page.goto(new URL("/settings", web).href);
  const settingsButton = page.getByRole("button", { name: "Settings", exact: true });
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  const app = settings.getByRole("region", { name: "Web app", exact: true });
  await settingsButton.click();
  await expect(app).toContainText("Add to Home Screen");
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();

  await page.evaluate(() => {
    const prompt = () =>
      new Promise<void>((resolve) =>
        window.addEventListener("appinstalled", () => resolve(), { once: true }),
      );
    window.dispatchEvent(Object.assign(new Event("beforeinstallprompt"), { prompt }));
  });
  await settingsButton.click();
  await app.getByRole("button", { name: "Install Raypx", exact: true }).click();
  await expect(app.getByRole("button", { name: "Opening installer…", exact: true })).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(app).toContainText("Installed");
  await expect(app.getByRole("button")).toHaveCount(0);
});

test("Web exposes an installable manifest and retries the same page URL after going offline", async ({
  page,
  context,
}) => {
  const target = new URL("/settings?source=pwa", web).href;
  await page.goto(target);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(manifest.headers()["content-type"]).toContain("application/manifest+json");
  expect(await manifest.json()).toMatchObject({
    id: "/",
    name: "Raypx",
    scope: "/",
    start_url: "/agents",
    display: "standalone",
    icons: expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]),
  });
  for (const path of [
    "/favicon.png",
    "/pwa/icon-192.png",
    "/pwa/icon-maskable-512.png",
    "/pwa/apple-touch-icon.png",
  ]) {
    const icon = await page.request.get(path);
    expect(icon.ok()).toBe(true);
    expect(icon.headers()["content-type"]).toContain("image/png");
  }
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL))
    .toBe(new URL("/sw.js", web).href);
  await context.setOffline(true);
  expect(
    await page.evaluate(() =>
      fetch("/health", { cache: "no-store" }).then(
        () => "response",
        () => "offline",
      ),
    ),
  ).toBe("offline");
  const offline = await page.reload({ waitUntil: "domcontentloaded" });
  expect(offline?.status()).toBe(503);
  expect(offline?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole("heading", { name: "Unable to connect", exact: true })).toBeVisible();
  expect(await page.evaluate(() => caches.keys())).toEqual([]);

  await context.setOffline(false);
  const retry = page.waitForResponse(
    (response) => response.url() === target && response.request().isNavigationRequest(),
  );
  await page.getByRole("link", { name: "Try again", exact: true }).click();
  expect((await retry).ok()).toBe(true);
  await expect(page).toHaveURL(target);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
});
