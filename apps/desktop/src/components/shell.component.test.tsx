import { BrowserLanguageProvider } from "../i18n.js";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DesktopShell } from "./shell.js";
import { Route as HomeRoute } from "../routes/index.js";

vi.mock("../features/auth/client.js", () => ({
  authClient: { useSession: () => ({ isPending: false, error: null, data: null }) },
}));
vi.mock("../features/auth/sign-out.js", () => ({
  useDesktopSignOut: () => ({ busy: false, error: null, signOut: vi.fn() }),
}));
vi.mock("../features/engine/provider.js", () => ({
  useDesktopEngine: () => ({ engine: { status: "ready" }, restart: vi.fn() }),
}));
vi.mock("../features/analytics/client.js", () => ({ analytics: {} }));
vi.mock("@raypx/analytics/client", () => ({ AnalyticsIdentity: () => null }));
vi.mock("../features/settings/overlay.js", () => ({ SettingsOverlay: () => null }));

const histories: ReturnType<typeof createMemoryHistory>[] = [];
afterEach(() => {
  cleanup();
  for (const history of histories.splice(0)) history.destroy();
});

async function page(locale: "en" | "zh") {
  const root = createRootRoute({ component: DesktopShell });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: "/",
        beforeLoad: HomeRoute.options.beforeLoad!,
      }),
      createRoute({
        getParentRoute: () => root,
        path: "/agents",
        component: () => <h1>Conversation workspace</h1>,
      }),
      createRoute({ getParentRoute: () => root, path: "/memory", component: () => null }),
      createRoute({ getParentRoute: () => root, path: "/account", component: () => null }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  histories.push(router.history);
  await router.load();
  await act(async () => {
    render(
      <BrowserLanguageProvider initialPreference={locale} restorePreference={false}>
        <RouterProvider router={router} />
      </BrowserLanguageProvider>,
    );
  });
  return router;
}

it.each([
  {
    locale: "en",
    agents: "Agents",
    memory: "Memory and templates",
    account: "Account",
    search: "Search",
    settings: "Settings",
    removed: /Projects|Waiting|Automations|New session/,
  },
  {
    locale: "zh",
    agents: "智能体",
    memory: "记忆与模板",
    account: "账号",
    search: "搜索",
    settings: "设置",
    removed: /项目|等待处理|自动化|新建会话/,
  },
] as const)(
  "opens Agents with current navigation and a single page heading in $locale",
  async ({ locale, agents, memory, account, search, settings, removed }) => {
    const router = await page(locale);
    expect(router.state.location.pathname).toBe("/agents");
    const nav = within(screen.getByRole("navigation", { name: "Raypx" }));
    expect(nav.getByRole("link", { name: agents }).getAttribute("href")).toBe("/agents");
    expect(nav.getByRole("link", { name: memory }).getAttribute("href")).toBe("/memory");
    expect(nav.getByRole("link", { name: account }).getAttribute("href")).toBe("/account");
    expect(nav.queryByRole("link", { name: removed })).toBeNull();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.getByRole("button", { name: settings })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: search }));
    const palette = await screen.findByRole("dialog", { name: search });
    expect(within(palette).queryByRole("option", { name: removed })).toBeNull();
  },
);
