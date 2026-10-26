import { test as base } from "@playwright/test";
import { authResponse } from "./account-fixture.js";

/** Browser response fixtures; real authentication remains in the PostgreSQL gate. */
export const test = base.extend<{ publicApi: undefined }>({
  publicApi: [
    async ({ page }, use) => {
      await page.route("**/rpc/configuration/public", (route) =>
        authResponse(route, { json: { siteName: "Raypx", registrationEnabled: true } }),
      );
      await page.route("**/rpc/configuration/access", (route) =>
        authResponse(route, { json: { allowed: false } }),
      );
      await page.route("**/rpc/account/get", async (route) => {
        if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
        return authResponse(
          route,
          {
            json: {
              defined: false,
              code: "UNAUTHORIZED",
              message: "Authentication required",
              data: { error: { code: "AUTH_REQUIRED" } },
            },
          },
          401,
        );
      });
      await page.route(/\/api\/auth\//, async (route) => {
        if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
        if (new URL(route.request().url()).pathname.endsWith("/get-session"))
          return authResponse(route, null);
        return authResponse(
          route,
          { code: "TEST_UNEXPECTED_AUTH_REQUEST", message: "Unexpected request" },
          500,
        );
      });

      await use(undefined);
    },
    { auto: true },
  ],
});
