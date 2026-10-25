import { expect, type Page } from "@playwright/test";

/** Long task content must scroll without moving application navigation off-screen. */
export async function expectViewportShell(page: Page) {
  const main = page.getByRole("main");
  const sidebar = page.getByRole("complementary");
  const banner = page.getByRole("banner");
  await main.evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
  const viewport = page.viewportSize()!;
  const sidebarBefore = await sidebar.boundingBox();
  const bannerBefore = await banner.boundingBox();
  const mainBefore = await main.boundingBox();
  expect(sidebarBefore!.y).toBe(0);
  expect(sidebarBefore!.height).toBeCloseTo(viewport.height, 0);
  expect(bannerBefore!.y).toBe(0);
  expect(mainBefore!.y).toBeCloseTo(bannerBefore!.height, 0);
  expect(mainBefore!.y + mainBefore!.height).toBeCloseTo(viewport.height, 0);
  const search = await page.getByRole("searchbox").boundingBox();
  expect(search!.width).toBeGreaterThanOrEqual(Math.min(240, mainBefore!.width - 40));
  for (const filter of await page.getByRole("combobox").all()) {
    expect((await filter.boundingBox())!.width).toBeGreaterThanOrEqual(
      viewport.width < 500 ? 120 : 160,
    );
  }
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <= innerHeight + 1 &&
        document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await main.evaluate((element) =>
    element.scrollTo({ top: element.scrollHeight, behavior: "instant" }),
  );
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await sidebar.boundingBox()).toEqual(sidebarBefore);
  expect(await banner.boundingBox()).toEqual(bannerBefore);
  await expect(page.getByRole("button", { name: /^(Activity|活动记录)$/ })).toBeInViewport();
  await expect(sidebar.getByRole("button", { name: /^(Account menu|账号菜单)$/ })).toBeInViewport();
  await main.evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
}
