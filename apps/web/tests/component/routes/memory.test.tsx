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
import type { ContextDocumentSummary } from "@raypx/memory";
import type { MemoryUsagePort } from "@raypx/memory/client";
const mocks = vi.hoisted(() => ({
  account: null as string | null,
  list: vi.fn<() => Promise<ContextDocumentSummary[]>>(async () => []),
  projects: vi.fn(async () => []),
  usage: vi.fn<MemoryUsagePort["scheduledPlans"]>(async () => []),
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
  memoryUsage: { scheduledPlans: mocks.usage },
}));
import { Route } from "../../../src/routes/(app)/memory";
beforeEach(() => {
  mocks.account = null;
  mocks.list.mockClear();
  mocks.projects.mockClear();
  mocks.usage.mockClear();
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
  expect(mocks.usage).not.toHaveBeenCalled();
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
  expect(mocks.usage).not.toHaveBeenCalled();
});
it("connects the account usage reader only to an explicit archive confirmation", async () => {
  mocks.account = "one";
  const id = "11111111-1111-4111-8111-111111111111";
  mocks.list.mockResolvedValueOnce([
    {
      id,
      kind: "memory",
      name: "Account reference",
      category: "",
      project: null,
      revision: 1,
      archived: false,
      createdAt: "2026-10-26T00:00:00Z",
      updatedAt: "2026-10-26T00:00:00Z",
    },
  ]);
  mocks.usage.mockResolvedValueOnce([{ id: "plan-one", name: "Daily review", enabled: true }]);
  await page();
  await screen.findByRole("heading", { name: "Account reference" });
  expect(mocks.usage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Archive: Account reference" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent("Cloud schedules referencing this item: 1.");
  expect(dialog).toHaveTextContent("Daily review (Enabled)");
  expect(mocks.usage.mock.calls[0]?.[0]).toEqual({ id });
});
