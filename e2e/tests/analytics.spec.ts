import { gunzipSync } from "node:zlib";
import { expect } from "@playwright/test";
import { test } from "./helpers/browser-fixture.js";
import { surfaces } from "./helpers/surfaces.js";
import { capture } from "./helpers/capture.js";
import { authResponse, signedInAccount } from "./helpers/account-fixture.js";

for (const [surface, base] of surfaces) {
  test(
    `${surface} analytics requires opt-in, separates categories and redacts actual SDK requests`,
    { tag: `@${surface.toLowerCase()}` },
    async ({ page }) => {
      await page.addInitScript(() => {
        // Exercise human-browser collection: PostHog also filters HeadlessChrome UA brands.
        Object.defineProperty(navigator, "webdriver", { get: () => false });
        Object.defineProperty(navigator, "userAgentData", {
          get: () => ({
            brands: [{ brand: "Chromium", version: "156" }],
            mobile: false,
            platform: "Windows",
          }),
        });
      });
      const user = await signedInAccount(page);

      const events: { event: string; properties: Record<string, unknown> }[] = [];
      await page.route("https://analytics.example.test/**", async (route) => {
        if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
        expect(route.request().headers().referer).toBeUndefined();
        const body = route.request().postDataBuffer();
        if (body) {
          const text = (body[0] === 31 && body[1] === 139 ? gunzipSync(body) : body).toString(
            "utf8",
          );
          const parsed = JSON.parse(text);
          events.push(...(Array.isArray(parsed) ? parsed : (parsed.batch ?? [parsed])));
        }
        return authResponse(route, {});
      });
      await page.goto(`${base}/settings?token=secret-reset-token`);
      const usage = page.getByRole("switch", { name: "Usage statistics", exact: true }),
        errors = page.getByRole("switch", { name: "Error reports", exact: true });
      await expect(usage).toBeEnabled();
      await expect(usage).not.toBeChecked();
      await expect(errors).not.toBeChecked();
      expect(events).toHaveLength(0);
      await usage.check();
      await expect.poll(() => events.some((event) => event.event === "page_viewed")).toBe(true);
      await expect
        .poll(() =>
          events.some(
            (event) => event.event === "$identify" && event.properties.distinct_id === user.id,
          ),
        )
        .toBe(true);
      await errors.check();
      const trigger = async () =>
        page.evaluate(() => {
          const error = new Error("private-prompt /Users/private key=secret-reset-token");
          error.stack = `Error: private-prompt\n at work (${location.origin}/assets/app-fixture.js:7:9)\n at file:///Users/private/a.js:1:2`;
          window.dispatchEvent(new ErrorEvent("error", { error, cancelable: true }));
        });
      await trigger();
      await expect
        .poll(() => events.filter((event) => event.event === "$exception").length)
        .toBe(1);
      expect(JSON.stringify(events)).not.toMatch(
        /private-prompt|secret-reset-token|\/Users\/private|desktop@example/,
      );
      await usage.uncheck();
      await expect(usage).not.toBeChecked();
      await trigger();
      await expect
        .poll(() => events.filter((event) => event.event === "$exception").length)
        .toBe(2);
      expect(
        events.filter((event) => event.event === "$exception").at(-1)!.properties.distinct_id,
      ).not.toBe(user.id);
      await page.reload();
      await expect(usage).not.toBeChecked();
      await expect(errors).toBeChecked();
      await errors.uncheck();
      const count = events.length;
      await trigger();
      await page.waitForTimeout(150);
      expect(events).toHaveLength(count);
      // A fresh SDK must honor a new opt-in even after its previous instance persisted opt-out.
      await page.reload();
      await expect(usage).not.toBeChecked();
      await expect(errors).not.toBeChecked();
      await errors.check();
      await trigger();
      await expect
        .poll(() => events.filter((event) => event.event === "$exception").length)
        .toBe(3);
      await errors.uncheck();
      if (surface === "Web") await page.setViewportSize({ width: 390, height: 844 });
      await capture(page, {
        path: test.info().outputPath("analytics-settings.png"),
        fullPage: true,
      });
    },
  );
}
