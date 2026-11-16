import { test as base } from "@playwright/test";
import { accountAccessFixture, authResponse } from "./account-fixture.js";

/** Browser response fixtures; real authentication remains in the PostgreSQL gate. */
export const test = base.extend<{
  publicApi: undefined;
  surface: "Web" | "Desktop";
  base: string;
}>({
  surface: async ({ baseURL }, provide, info) => {
    if (!baseURL) throw new Error("A browser project must declare its baseURL");
    if (info.project.name !== "web" && info.project.name !== "desktop")
      throw new Error("Shared browser journeys require the web or desktop Playwright project");
    await provide(info.project.name === "web" ? "Web" : "Desktop");
  },
  base: async ({ baseURL }, provide) => {
    if (!baseURL) throw new Error("A browser project must declare its baseURL");
    await provide(baseURL);
  },
  publicApi: [
    async ({ page }, use) => {
      await page.route("**/*", (route) => {
        const host = new URL(route.request().url()).hostname;
        return ["localhost", "127.0.0.1", "[::1]"].includes(host)
          ? route.fallback()
          : route.abort("blockedbyclient");
      });
      await page.route("**/api/rpc/**", (route) => {
        if (route.request().method() === "OPTIONS") return authResponse(route, null, 204);
        const path = new URL(route.request().url()).pathname;
        if (path === "/api/rpc/configuration/public" || path === "/api/rpc/configuration/access")
          return route.fallback();
        return authResponse(
          route,
          {
            json: { defined: false, code: "NOT_FOUND", message: "Unconfigured fixture operation" },
          },
          404,
        );
      });
      await page.routeWebSocket("**/*", (socket) => {
        const url = new URL(socket.url());
        if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
          void socket.close();
          return;
        }
        // Synthetic workspace reads need a matching stream so an unmocked socket
        // failure cannot race healthy HTTP fixtures during navigation.
        if (url.pathname === "/api/events")
          socket.send(JSON.stringify({ type: "ready", version: 1 }));
        else socket.connectToServer();
      });
      await accountAccessFixture(page, null);
      await page.route("**/api/rpc/configuration/public", (route) =>
        authResponse(route, {
          json: {
            siteName: "Raypx",
            registrationEnabled: true,
            bootstrap: false,
            setupTokenRequired: false,
            mailConfigured: true,
          },
        }),
      );
      await page.route("**/api/rpc/configuration/access", (route) =>
        authResponse(route, { json: { allowed: false } }),
      );
      await page.route("**/api/rpc/account/get", async (route) => {
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
