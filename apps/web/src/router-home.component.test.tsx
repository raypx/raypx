import { BrowserLanguageProvider } from "./i18n.js";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import type { AccountState } from "@raypx/account";

import { expect, it, vi } from "vite-plus/test";

const session = vi.hoisted(() => vi.fn(() => ({ isPending: true, data: null, error: null })));
vi.mock("./features/auth/client.js", () => ({
  apiUrl: "https://api.example.test",
  authClient: { useSession: session },
}));
import { Route as LandingRoute } from "./routes/(landing)/index.js";
import { Route as ProjectsRoute } from "./routes/(app)/projects.js";

async function html(account: AccountState, path = "/") {
  const root = createRootRouteWithContext<{ account: AccountState }>()({ component: Outlet });
  const app = createRoute({ getParentRoute: () => root, id: "(app)", component: Outlet });
  const landing = createRoute({ getParentRoute: () => root, id: "(landing)", component: Outlet });
  const home = createRoute({
    getParentRoute: () => landing,
    path: "/",
    component: LandingRoute.options.component!,
  });
  const projects = createRoute({
    getParentRoute: () => app,
    path: "/projects",
    component: ProjectsRoute.options.component!,
  });
  const router = createRouter({
    routeTree: root.addChildren([landing.addChildren([home]), app.addChildren([projects])]),
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { account },
    isServer: true,
  });
  await router.load();
  return renderToString(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <RouterProvider router={router} />
    </BrowserLanguageProvider>,
  );
}

it("server-renders the landing page before the browser session resolves", async () => {
  const page = await html({ status: "signed-out" });
  expect(page).toMatch(/<h1[^>]*>Run locally\. Review remotely\.<\/h1>/);
  expect(page).toContain("Open projects");
  expect(page).toContain("Draft privacy");
  expect(page).toContain("Sessions");
  expect(page).toContain('href="/automations"');
  expect(page).toContain('href="/memory"');
  expect(page).toContain("Desktop to Web connection");
  expect(page).not.toContain("Appearance and language");
  expect(page).not.toContain('role="status"');
  expect(page).toContain('aria-busy="true"');
  expect(page).toContain("Loading…");
  expect(page).not.toContain('href="/login"');
});

it("keeps an unavailable account distinct from a confirmed guest during SSR", async () => {
  const page = await html({ status: "unavailable" }, "/projects");
  expect(page).toContain("Unable to connect. Check your connection and try again.");
  expect(page).not.toContain("Run locally. Review remotely.");
});

it("server-renders the landing page even when account access is unavailable", async () => {
  const page = await html({ status: "unavailable" });
  expect(page).toContain("Run locally. Review remotely.");
  expect(page).not.toContain("Unable to connect.");
});
