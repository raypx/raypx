import {
  test,
  desktop,
  capture,
  authResponse,
  signedInAccount,
  expectPrivatePages,
} from "@raypx/e2e/testing";
import { expect } from "@playwright/test";

test(
  "Desktop keeps local tools public and asks for login only for remote features",
  { tag: ["@desktop", "@smoke"] },
  async ({ page }) => {
    const privateReads: string[] = [];
    await page.route("**/api/auth/get-session**", (route) => authResponse(route, null));
    page.on("request", (request) => {
      if (
        /\/rpc\/(tasks|devices|account|approvals|observed|relay|memory|jobs)\//.test(request.url())
      )
        privateReads.push(request.url());
    });
    for (const path of ["/", "/tasks", "/terminal", "/automations", "/account"]) {
      await page.goto(desktop + path);
      await expect(page).toHaveURL(desktop + path);
      await expect(page.getByRole("navigation", { name: "Raypx", exact: true })).toBeVisible();
      await expect(
        page.getByRole("complementary").getByRole("button", { name: "Sign in", exact: true }),
      ).toBeVisible();
      if (["/terminal", "/automations", "/account"].includes(path)) {
        for (const width of [1280, 800]) {
          for (const colorScheme of ["light", "dark"] as const) {
            await page.setViewportSize({ width, height: width === 800 ? 844 : 720 });
            await page.emulateMedia({ colorScheme });
            await page.reload();
            await expect(page.locator("html")).toHaveCSS("color-scheme", colorScheme);
            const main = page.getByRole("main");
            await expect(main).toBeVisible();
            if (path === "/automations") {
              await expect(
                main.getByRole("button", { name: "New automation", exact: true }),
              ).toBeDisabled();
              await expect(
                main.getByText("Open the desktop app to use local tools.", { exact: true }),
              ).toBeVisible();
            }
            await expect
              .poll(() =>
                main.evaluate((element) => {
                  const bounds = element.getBoundingClientRect();
                  return (
                    bounds.width > 0 &&
                    bounds.left >= 0 &&
                    bounds.right <= innerWidth + 1 &&
                    document.documentElement.scrollWidth <= innerWidth + 1
                  );
                }),
              )
              .toBe(true);
            if (path === "/account") {
              const signIn = main.getByRole("link", { name: "Sign in", exact: true });
              await expect(signIn).toBeVisible();
              expect((await signIn.boundingBox())!.height).toBeGreaterThanOrEqual(30);
            }
            await capture(page, {
              path: test
                .info()
                .outputPath(`desktop${path.replace("/", "-")}-${width}-${colorScheme}.png`),
              fullPage: true,
              animations: "disabled",
            });
          }
        }
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.emulateMedia({ colorScheme: "light" });
      }
    }
    await page.goto(desktop + "/tasks#settings");
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(settings.getByRole("combobox", { name: "Language", exact: true })).toBeVisible();
    for (const width of [1280, 800]) {
      for (const colorScheme of ["light", "dark"] as const) {
        await page.setViewportSize({ width, height: width === 800 ? 520 : 800 });
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await expect(page.locator("html")).toHaveCSS("color-scheme", colorScheme);
        const bounds = await settings.boundingBox();
        expect(bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height - 47);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        await capture(page, {
          path: test.info().outputPath(`desktop-settings-${width}-${colorScheme}.png`),
          animations: "disabled",
        });
      }
    }
    await page.keyboard.press("Escape");
    await expect(settings).toBeHidden();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL(desktop + "/tasks");
    expect(privateReads).toEqual([]);
    // Guests have no connected-computer shortcuts; remote views stay reachable by URL.
    await page.goto(desktop + "/tasks?scope=remote");
    await expect(
      page.getByRole("heading", { name: "Sign in for remote access", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?returnTo=%2Ftasks%3Fscope%3Dremote/);
    await page.getByRole("link", { name: "Create account", exact: true }).click();
    await expect(page).toHaveURL(/\/signup\?returnTo=/);
    await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toBeVisible();
    await page.goto(desktop + "/welcome");
    await expect(
      page.getByRole("heading", { name: "Start on this computer", exact: true }),
    ).toBeVisible();
    await capture(page, {
      path: test.info().outputPath("desktop-local-welcome.png"),
      fullPage: true,
      animations: "disabled",
    });
    await expectPrivatePages(page, "Desktop", privateReads);
  },
);

test(
  "Desktop returns to the requested remote page after login and keeps local tools after logout",
  { tag: "@desktop" },
  async ({ page }) => {
    await page.route("**/api/auth/get-session**", (route) => authResponse(route, null));
    await page.goto(desktop + "/tasks?scope=remote");
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await page.route("**/api/auth/sign-in/email", async (route) => {
      const user = await signedInAccount(page);
      return authResponse(route, { user, token: "browser-fixture-only" });
    });
    await page
      .getByRole("textbox", { name: "Email address", exact: true })
      .fill("desktop@example.test");
    await page.getByLabel("Password", { exact: true }).fill("browser-fixture-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(desktop + "/tasks?scope=remote");
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await page.route("**/api/auth/sign-out", async (route) => {
      await page.route("**/api/auth/get-session**", (session) => authResponse(session, null));
      return authResponse(route, { success: true });
    });
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(desktop + "/");
    await expect(
      page.getByRole("heading", { name: "Start on this computer", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Raypx", exact: true })).toBeVisible();
  },
);

test(
  "Desktop distinguishes an unavailable session check from being signed out",
  { tag: "@desktop" },
  async ({ page }) => {
    let available = false;
    await page.route("**/api/auth/get-session**", (route) =>
      available
        ? authResponse(route, null)
        : authResponse(
            route,
            { code: "FIXTURE_UNAVAILABLE", message: "private session diagnostic" },
            500,
          ),
    );
    await page.goto(desktop + "/tasks#settings");
    await expect(page.getByRole("alert")).toContainText(
      "Unable to connect. Check your connection and try again.",
    );
    await expect(page).toHaveURL(desktop + "/tasks#settings");
    await expect(page.getByText("private session diagnostic")).toHaveCount(0);
    await capture(page, {
      path: test.info().outputPath("desktop-settings-session-unavailable.png"),
      animations: "disabled",
    });
    available = true;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page).toHaveURL(desktop + "/tasks#settings");
    await expect(
      page.getByRole("heading", { name: "Sign in for remote access", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeVisible();
  },
);
