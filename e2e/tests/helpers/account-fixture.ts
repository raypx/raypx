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

export async function signedInAccount(page: Page) {
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
  await page.route("**/rpc/approvals/list", (route) => authResponse(route, { json: [] }));
  await page.route("**/rpc/observed/list", (route) =>
    authResponse(route, { json: { sessions: [], requests: [] } }),
  );
  await page.route("**/rpc/devices/list", (route) => authResponse(route, { json: [] }));
  return user;
}

export async function connectedProject(page: Page, deviceId: string, projectId: string) {
  await page.route("**/rpc/devices/list", (route) =>
    authResponse(route, {
      json: [
        {
          id: deviceId,
          name: "Development Mac",
          platform: "darwin",
          appVersion: "0.1.0",
          epoch: 1,
          revoked: false,
          online: true,
          lastSeenAt: null,
          projects: [{ id: projectId, name: "Raypx", providers: ["codex"], dirty: false }],
          capabilities: [
            {
              provider: "codex",
              available: true,
              version: "0.163.0",
              reason: "ready",
              definition: {
                version: 1 as const,
                runtime: "process" as const,
                modes: ["plan" as const, "run" as const],
                approvals: true,
                modelSelection: false,
              },
              inputModes: ["queue", "steer"],
            },
          ],
        },
      ],
    }),
  );
}
