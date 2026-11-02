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
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { expect, it, vi } from "vite-plus/test";

const session = vi.hoisted(() => vi.fn(() => ({ isPending: true, data: null, error: null })));
vi.mock("./features/auth/client", () => ({
  apiUrl: "https://api.example.test",
  authClient: { useSession: session },
}));
import { Route } from "./routes/(app)/index";

async function html(account: AccountState) {
  const root = createRootRouteWithContext<{ account: AccountState }>()({ component: Outlet });
  const app = createRoute({ getParentRoute: () => root, id: "(app)", component: Outlet });
  const home = createRoute({
    getParentRoute: () => app,
    path: "/",
    component: Route.options.component!,
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([home])]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
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

it("server-renders the confirmed guest page before the browser session resolves", async () => {
  const page = await html({ status: "signed-out" });
  expect(page).toContain("<h1>Remote sessions and approvals</h1>");
  expect(page).toContain("Write a session draft");
  expect(page).not.toContain('role="status"');
  expect(session).not.toHaveBeenCalled();
});

it("keeps an unavailable account distinct from a confirmed guest during SSR", async () => {
  const page = await html({ status: "unavailable" });
  expect(page).toContain("Unable to connect. Check your connection and try again.");
  expect(page).not.toContain("Remote sessions and approvals");
});
