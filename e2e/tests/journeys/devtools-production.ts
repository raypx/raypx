import { expect } from "@playwright/test";
import { test } from "../helpers/browser-fixture.js";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Register the shared journey in the owning application's Playwright file. */
export function registerTests(fixtureUtility: string) {
  test(`compiled pages exclude development diagnostics`, async ({ page, surface, base }) => {
    const diagnosticRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/__devtools/") || request.url().includes("/@raypx/devtools"))
        diagnosticRequests.push(request.url());
    });
    await page.goto(`${base}/settings`);
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await page.keyboard.press("Shift+Alt+d");
    await expect(page.locator("[data-raypx-devtools-panel]")).toHaveCount(0);
    await expect(page.locator("script[data-raypx-devtools-client]")).toHaveCount(0);
    expect(diagnosticRequests).toEqual([]);
    const roots =
      surface === "Web"
        ? ["../../../apps/web/.output/public", "../../../apps/web/.output/server"]
        : ["../../../apps/desktop/artifacts/browser/client"];
    for (const relative of roots) {
      const root = fileURLToPath(new URL(relative, import.meta.url));
      const files = (await readdir(root, { recursive: true })).filter((file) =>
        /\.(?:js|mjs)$/.test(file),
      );
      expect(files.length).toBeGreaterThan(0);
      for (const file of files)
        expect(
          /\/__devtools\/embedded\.js|data-raypx-devtools-panel|raypx:page-state|@raypx\/devtools\/renderer/.test(
            await readFile(join(root, file), "utf8"),
          ),
          file,
        ).toBe(false);
    }
  });

  test("compiled styles exclude browser-only utility classes", async ({ surface }) => {
    const root = fileURLToPath(
      new URL(
        surface === "Web"
          ? "../../../apps/web/.output/public"
          : "../../../apps/desktop/artifacts/browser/client",
        import.meta.url,
      ),
    );
    const files = (await readdir(root, { recursive: true })).filter((file) =>
      file.endsWith(".css"),
    );
    expect(files.length).toBeGreaterThan(0);
    const value = /^z-\[(\d+)\]$/.exec(fixtureUtility)?.[1];
    expect(value).toBeDefined();
    for (const file of files)
      expect((await readFile(join(root, file), "utf8")).replaceAll(/\s/g, ""), file).not.toContain(
        `z-index:${value}`,
      );
  });
}
