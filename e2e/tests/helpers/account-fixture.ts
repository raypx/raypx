import type { Page, Route } from "@playwright/test";

const web = "http://127.0.0.1:4173";

export async function authResponse(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": route.request().headers().origin ?? web,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "Content-Type,Accept-Language",
    },
    body: status === 204 ? "" : JSON.stringify(body),
  });
}

export async function webShellFixture(page: Page) {
  // This deliberately invalid cookie lets SSR render its API-unavailable state.
  // Browser HTTP fixtures below supply UI data; this does not authenticate a user.
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: "browser-fixture-only",
      url: web,
      httpOnly: true,
    },
  ]);
}

export async function signedInDesktop(page: Page) {
  const user = {
    id: "desktop-fixture",
    name: "Desktop User",
    email: "desktop@example.test",
    emailVerified: true,
  };
  await page.route("**/api/auth/get-session**", (route) =>
    authResponse(route, {
      user,
      session: {
        id: "desktop-session",
        userId: user.id,
        token: "browser-fixture-only",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  await page.route("**/rpc/account/get", (route) =>
    authResponse(route, { json: { id: user.id, name: user.name, email: user.email } }),
  );
  await page.route("**/rpc/approvals/list", (route) => authResponse(route, { json: [] }));
  await page.route("**/rpc/observed/list", (route) =>
    authResponse(route, { json: { sessions: [], requests: [] } }),
  );
  await page.route("**/rpc/devices/list", (route) => authResponse(route, { json: [] }));
  return user;
}
