import type { ReactNode } from "react";
import {
  createHashHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import { Route as RootRoute } from "./routes/__root.js";
import { Route as AuthRoute } from "./routes/(auth)/route.js";
import { Route as LoginRoute } from "./routes/(auth)/login.js";

expect.extend(matchers);

const mocks = vi.hoisted(() => ({
  signedIn: false,
  approvalSettings: vi.fn(() => null),
  modelConnections: vi.fn(() => null),
}));
vi.mock("./features/auth/client.js", () => ({
  apiUrl: "https://api.example.test",
  webUrl: "https://raypx.example",
  authClient: {
    useSession: () => ({
      data: mocks.signedIn
        ? { user: { id: "account", name: "Ada", email: "ada@example.test" } }
        : null,
      isPending: false,
      error: null,
    }),
  },
}));
vi.mock("./features/auth/sign-out.js", () => ({
  DesktopSignOutProvider: ({ children }: { children: ReactNode }) => children,
  useDesktopSignOut: () => ({ busy: false, error: null, signOut: vi.fn() }),
}));
vi.mock("./features/engine/provider.js", () => ({
  DesktopRuntimeProvider: ({ children }: { children: ReactNode }) => children,
  useDesktopEngine: () => ({ engine: { status: "ready" }, restart: vi.fn() }),
}));
vi.mock("./features/analytics/provider.js", () => ({
  AppAnalytics: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./features/analytics/client.js", () => ({ analytics: {} }));
vi.mock("@raypx/analytics/client", () => ({ AnalyticsIdentity: () => null }));
vi.mock("@raypx/analytics/client/settings", () => ({ AnalyticsSettings: () => null }));
vi.mock("@raypx/agents/client", () => ({
  ApprovalSettings: mocks.approvalSettings,
  ModelConnections: mocks.modelConnections,
  McpServers: () => null,
  OpenApiServers: () => null,
}));
vi.mock("./features/settings/capabilities.js", () => ({ AccountSkills: () => null }));
vi.mock("@raypx/devtools", () => ({ DevtoolsBridge: () => null }));

const disposers: (() => void)[] = [];
beforeEach(() => {
  mocks.signedIn = false;
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  for (const dispose of disposers.splice(0)) dispose();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

async function page(url: string, language: "en" | "zh" = "en", packaged = false) {
  localStorage.setItem("raypx_locale", language);
  if (packaged) window.history.replaceState({}, "", `/index.html#${url}`);
  const history = packaged ? createHashHistory() : createMemoryHistory({ initialEntries: [url] });
  // Keep the real root composition: the overlay must not depend on DesktopShell mounting.
  const root = createRootRoute({ component: RootRoute.options.component! });
  const auth = createRoute({
    getParentRoute: () => root,
    id: "(auth)",
    validateSearch: AuthRoute.options.validateSearch!,
    component: Outlet,
  });
  const router = createRouter({
    history,
    routeTree: root.addChildren([
      auth.addChildren([
        createRoute({
          getParentRoute: () => auth,
          path: "/login",
          component: LoginRoute.options.component!,
        }),
      ]),
      createRoute({
        getParentRoute: () => root,
        path: "/agents",
        validateSearch: (search) => search,
        component: () => <h1>Conversation workspace</h1>,
      }),
      createRoute({
        getParentRoute: () => root,
        path: "/account",
        component: () => <h1>Account page</h1>,
      }),
    ]),
  });
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  disposers.push(() => {
    history.destroy();
    queries.clear();
  });
  await router.load();
  await act(async () => {
    render(
      <QueryClientProvider client={queries}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });
  return router;
}

it.each([
  {
    language: "en",
    settings: "Settings",
    appearance: "Appearance",
    languageLabel: "Language",
    close: "Close",
  },
  { language: "zh", settings: "设置", appearance: "外观", languageLabel: "语言", close: "关闭" },
] as const)(
  "opens signed-out login device preferences from #settings in $language",
  async ({ language, settings, appearance, languageLabel, close }) => {
    const router = await page("/login?returnTo=%2Faccount#settings", language);
    expect(await screen.findByRole("heading", { name: settings })).toBeVisible();
    const dialog = screen.getByRole("dialog", { name: settings });
    const theme = await within(dialog).findByRole("radiogroup", { name: appearance });
    expect(theme).toBeVisible();
    const dark = within(theme).getByRole("radio", { name: language === "en" ? "Dark" : "深色" });
    await userEvent.click(dark);
    await waitFor(() => expect(dark).toHaveAttribute("aria-checked", "true"));
    expect(within(dialog).getByRole("combobox", { name: languageLabel })).toBeEnabled();
    expect(mocks.approvalSettings).not.toHaveBeenCalled();
    expect(mocks.modelConnections).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: close }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: settings })).not.toBeInTheDocument(),
    );
    expect(router.state.location.href).toBe("/login?returnTo=%2Faccount");
  },
);

it("opens device preferences from the login screen and restores its opener on Escape", async () => {
  const router = await page("/login");
  await screen.findByRole("heading", { name: "Sign in" });
  const opener = screen.getByRole("button", { name: "Settings" });
  await userEvent.click(opener);
  const dialog = await screen.findByRole("dialog", { name: "Settings" });
  await within(dialog).findByRole("combobox", { name: "Language" });
  expect(router.state.location.href).toBe("/login#settings");
  await userEvent.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument(),
  );
  expect(router.state.location.href).toBe("/login");
  await waitFor(() => expect(opener).toHaveFocus());
});

it("opens signed-out packaged login settings without losing the hash route on close", async () => {
  const router = await page("/login#settings", "en", true);
  expect(await screen.findByRole("heading", { name: "Settings" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(router.state.location.hash).toBe(""));
  expect(window.location.pathname).toBe("/index.html");
  expect(window.location.hash).toBe("#/login");
});

it("keeps signed-in account navigation, settings and the keyboard command entry", async () => {
  mocks.signedIn = true;
  const router = await page("/agents?spaceId=work&agentId=notes");
  await screen.findByRole("heading", { name: "Conversation workspace" });
  await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Account" }));
  await screen.findByRole("heading", { name: "Account page" });
  expect(router.state.location.pathname).toBe("/account");
  const opener = screen.getByRole("button", { name: "Settings" });
  await userEvent.click(opener);
  expect(await screen.findByRole("heading", { name: "Settings" })).toBeVisible();
  expect(screen.getAllByRole("dialog", { name: "Settings" })).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument(),
  );
  await waitFor(() => expect(opener).toHaveFocus());
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const palette = await screen.findByRole("dialog", { name: "Search" });
  expect(
    within(palette).queryByRole("option", { name: "Memory and templates" }),
  ).not.toBeInTheDocument();
  expect(within(palette).getByRole("option", { name: "Agents" })).toBeVisible();
  expect(within(palette).getByRole("option", { name: "Account" })).toBeVisible();
  await userEvent.click(within(palette).getByRole("option", { name: "Settings" }));
  expect(await screen.findByRole("heading", { name: "Settings" })).toBeVisible();
  expect(router.state.location.href).toBe("/account#settings");
});

it.each([
  { search: "", destination: "/agents" },
  { search: "?returnTo=%2Fmemory", destination: "/agents" },
  {
    search: "?returnTo=%2Fagents%3FspaceId%3Dwork%26agentId%3Dnotes",
    destination: "/agents?spaceId=work&agentId=notes",
  },
])("keeps Back to workspace pointed at $destination", async ({ search, destination }) => {
  await page(`/login${search}`);
  expect(await screen.findByRole("link", { name: "Back to workspace" })).toHaveAttribute(
    "href",
    destination,
  );
});
