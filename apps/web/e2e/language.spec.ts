import { expect, type Page } from "@playwright/test";
import { authResponse, test } from "@raypx/e2e/testing";

const localeStorageKey = "raypx_locale";
const languages = {
  en: { heading: "Privacy", menu: "Language", option: "English" },
  zh: { heading: "隐私", menu: "语言", option: "简体中文" },
};

async function expectLanguage(page: Page, locale: keyof typeof languages) {
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(
    page.getByRole("heading", { name: languages[locale].heading, exact: true, level: 1 }),
  ).toBeVisible();
}

async function failFirstChineseCatalog(page: Page, responseReady?: Promise<void>) {
  let requests = 0;
  await page.route(/\/assets\/zh-[^/]+\.js$/, async (route) => {
    if (++requests === 1) {
      await responseReady;
      await route.fulfill({ status: 503, body: "Temporarily unavailable" });
      return;
    }
    await route.continue();
  });
  return () => requests;
}

test(
  "Web restores language after SSR hydration and synchronizes preferences across tabs",
  { tag: "@web" },
  async ({ page, context }) => {
    const errors: string[] = [];
    const watchErrors = (tab: Page) => {
      tab.on("pageerror", (error) => errors.push(error.message));
      tab.on("console", (message) => {
        if (
          message.type() === "error" &&
          /hydrat|did not match|Minified React error/i.test(message.text())
        ) {
          errors.push(message.text());
        }
      });
    };
    const localeCookie = async () =>
      (await context.cookies()).find((cookie) => cookie.name === "locale")?.value;
    watchErrors(page);

    await test.step("Hydrate the English response and restore the stored Chinese preference", async () => {
      // Seed the origin from a server-only route before the language provider mounts.
      await page.goto("/health");
      await page.evaluate((key) => localStorage.setItem(key, "zh"), localeStorageKey);
      expect(await localeCookie()).toBeUndefined();

      const response = await page.goto("/privacy");
      if (!response) throw new Error("Missing privacy document response");
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toMatch(/<html\b[^>]*\blang="en"/);
      expect(html).toMatch(/<h1\b[^>]*>Privacy<\/h1>/);
      await expectLanguage(page, "zh");
      await expect.poll(localeCookie).toBe("zh");
    });

    const other = await context.newPage();
    watchErrors(other);
    await other.route("**/rpc/configuration/public", (route) =>
      authResponse(route, { json: { siteName: "Raypx", registrationEnabled: true } }),
    );

    await test.step("Synchronize menu choices in both directions", async () => {
      await other.goto("/privacy");
      await expectLanguage(other, "zh");

      await page.getByRole("button", { name: languages.zh.menu, exact: true }).click();
      await page.getByRole("menuitemradio", { name: languages.en.option, exact: true }).click();
      await expectLanguage(page, "en");
      await expectLanguage(other, "en");

      await other.getByRole("button", { name: languages.en.menu, exact: true }).click();
      await other.getByRole("menuitemradio", { name: languages.zh.option, exact: true }).click();
      await expectLanguage(other, "zh");
      await expectLanguage(page, "zh");
    });

    await test.step("Keep following the system after another tab removes the preference", async () => {
      await other.evaluate((key) => localStorage.removeItem(key), localeStorageKey);
      await expectLanguage(page, "en");
      await expectLanguage(other, "en");
      await expect.poll(localeCookie).toBeUndefined();

      await page.reload();
      await expectLanguage(page, "en");
      await page.getByRole("button", { name: languages.en.menu, exact: true }).click();
      await expect(
        page.getByRole("menuitemradio", { name: "Follow system", exact: true }),
      ).toHaveAttribute("aria-checked", "true");
    });
    expect(errors).toEqual([]);
  },
);

test("Web retries a failed language download without resetting the sign-in draft", async ({
  page,
}) => {
  let releaseFirstResponse!: () => void;
  const firstResponse = new Promise<void>((resolve) => {
    releaseFirstResponse = resolve;
  });
  const requests = await failFirstChineseCatalog(page, firstResponse);
  try {
    await page.goto("/login");
    const language = page.getByRole("button", { name: "Language", exact: true });
    const email = page.getByRole("textbox", { name: "Email address", exact: true });
    await email.fill("language-draft@example.test");
    await language.click();
    await page.getByRole("menuitemradio", { name: "简体中文", exact: true }).click();
    await expect(page.getByText("Loading language…", { exact: true })).toBeAttached();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(email).toHaveValue("language-draft@example.test");

    releaseFirstResponse();
    const retry = page.getByRole("button", { name: "Retry language download", exact: true });
    await expect(retry).toBeVisible();
    await expect(email).toHaveValue("language-draft@example.test");
    await retry.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
    await expect(page.getByRole("button", { name: "语言", exact: true })).toBeFocused();
    await expect(page.getByRole("textbox", { name: "邮箱地址", exact: true })).toHaveValue(
      "language-draft@example.test",
    );
    expect(requests()).toBe(2);
  } finally {
    releaseFirstResponse();
  }
});

test("Web retries the server language preload before hydrating", async ({ page, base }) => {
  const requests = await failFirstChineseCatalog(page);
  await page.context().addCookies([{ name: "locale", value: "zh", url: base }]);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/privacy");
  if (!response) throw new Error("Missing privacy document response");
  expect(await response.text()).toMatch(/<html\b[^>]*\blang="zh"/);
  await expectLanguage(page, "zh");
  await page.getByRole("button", { name: "语言", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: "简体中文", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(requests()).toBe(2);
  expect(errors).toEqual([]);
});
