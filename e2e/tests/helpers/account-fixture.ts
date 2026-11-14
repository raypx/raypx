import type { Page, Route } from "@playwright/test";
import { accessForRole, type AccountRole } from "@raypx/account/access";

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

/** Supply the same account-scoped permission projection as the API. */
export async function accountAccessFixture(
  page: Page,
  accountId: string | null,
  role: AccountRole = accountId ? "member" : "guest",
) {
  await page.route("**/rpc/account/access", (route) =>
    route.request().method() === "OPTIONS"
      ? authResponse(route, null, 204)
      : authResponse(route, { json: accessForRole(role, accountId) }),
  );
}

export async function webShellFixture(page: Page) {
  // This deliberately invalid cookie lets SSR render its API-unavailable state.
  // The owned backend fixture recognizes this marker only to return 503 on the
  // SSR account read. Browser HTTP fixtures below supply UI data; it grants no session.
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: "browser-fixture-only",
      url: web,
      httpOnly: true,
    },
  ]);
}

export async function signedInAccount(page: Page) {
  await page.route("**/rpc/notifications/list", (route) =>
    authResponse(route, { json: { items: [], truncated: false } }),
  );
  await page.route("**/rpc/notifications/viewed", (route) =>
    authResponse(route, { json: { ok: true } }),
  );
  const user = {
    id: "desktop-fixture",
    name: "Desktop User",
    email: "desktop@example.test",
    emailVerified: true,
  };
  await accountAccessFixture(page, user.id);
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
  await page.route("**/rpc/spaces/list", (route) => authResponse(route, { json: [] }));
  return user;
}
