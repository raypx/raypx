import { expect, test } from "@playwright/test";

const origins: string[] = JSON.parse(process.env.RAYPX_DEPLOYMENT_ORIGINS ?? "[]");
test("one prepared Web artifact uses the current public origin after hydration", async ({
  browser,
}) => {
  test.skip(origins.length !== 2, "Requires the local production deployment smoke ingresses");
  const inventories: string[][] = [];
  for (const origin of origins) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/(rpc|api\/auth)\//.test(new URL(request.url()).pathname))
        apiRequests.push(request.url());
    });
    await page.goto(origin + "/login");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
    await expect.poll(() => apiRequests.length).toBeGreaterThan(0);
    expect(apiRequests.every((url) => new URL(url).origin === origin)).toBe(true);
    const config = await page.evaluate(() => Reflect.get(window, "__RAYPX_PUBLIC_CONFIG__"));
    expect(config.API_PUBLIC_URL).toBe("");
    inventories.push(
      await page
        .locator("script[src]")
        .evaluateAll((scripts) =>
          scripts.map((script) => new URL((script as HTMLScriptElement).src).pathname).sort(),
        ),
    );
    expect(errors).toEqual([]);
    await context.close();
  }
  expect(inventories[0]!.length).toBeGreaterThan(0);
  expect(inventories[1]).toEqual(inventories[0]);
});
