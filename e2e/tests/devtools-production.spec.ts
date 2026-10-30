import { expect } from "@playwright/test";
import { test } from "./helpers/browser-fixture.js";
import { surfaces } from "./helpers/surfaces.js";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

for (const [surface, base] of surfaces) {
  test(
    `${surface} compiled pages exclude development diagnostics`,
    { tag: surface === "Web" ? "@web" : "@desktop" },
    async ({ page }) => {
      const diagnosticRequests: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("/__devtools/") || request.url().includes("/@raypx/devtools"))
          diagnosticRequests.push(request.url());
      });
      await page.goto(`${base}/settings`);
      await expect(page.getByRole("heading", { name: "Make it yours" })).toBeVisible();
      await page.keyboard.press("Shift+Alt+d");
      await expect(page.locator("[data-raypx-devtools-panel]")).toHaveCount(0);
      await expect(page.locator("script[data-raypx-devtools-client]")).toHaveCount(0);
      expect(diagnosticRequests).toEqual([]);
      const roots =
        surface === "Web"
          ? ["../../apps/web/.output/public", "../../apps/web/.output/server"]
          : ["../../apps/desktop/artifacts/browser/client"];
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
    },
  );
}
