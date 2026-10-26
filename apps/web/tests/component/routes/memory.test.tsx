import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
const mocks = vi.hoisted(() => ({
  account: null as string | null,
  list: vi.fn(async () => []),
  projects: vi.fn(async () => []),
}));
vi.mock("../../../src/features/auth/client", () => ({
  apiUrl: "https://api.example.test",
  authClient: {
    useSession: () => ({
      isPending: false,
      error: null,
      data: mocks.account ? { user: { id: mocks.account } } : null,
    }),
  },
}));
vi.mock("../../../src/features/memory/client", () => ({
  accountMemory: { list: mocks.list },
  memoryProjects: { list: mocks.projects },
}));
import { Route } from "../../../src/routes/(app)/memory";
beforeEach(() => {
  mocks.account = null;
  mocks.list.mockClear();
  mocks.projects.mockClear();
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
async function page() {
  const root = createRootRoute({ component: Outlet }),
    tree = root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: "/memory",
        component: Route.options.component!,
      }),
      createRoute({ getParentRoute: () => root, path: "/login", component: () => null }),
    ]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ["/memory"] }),
  });
  await router.load();
  render(
    <BrowserLanguageProvider>
      <RouterProvider router={router} />
    </BrowserLanguageProvider>,
  );
  return router;
}
it("does not read account references for a guest and returns to the original library", async () => {
  const router = await page();
  expect(screen.getByRole("heading", { name: "Memory and templates" })).toBeVisible();
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.projects).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("link", { name: "Sign in" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toMatchObject({ returnTo: "/memory" });
});
it("loads reference metadata only after a confirmed account", async () => {
  mocks.account = "one";
  await page();
  expect(await screen.findByText(/No references match/)).toBeVisible();
  expect(mocks.list).toHaveBeenCalledTimes(1);
  expect(mocks.projects).toHaveBeenCalledTimes(1);
});
