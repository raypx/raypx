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
  list: vi.fn(async () => ({ enabled: true, jobs: [] })),
  devices: vi.fn(async () => []),
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
vi.mock("../../../src/features/automations/client", () => ({
  cloudJobs: { list: mocks.list },
  jobDevices: { list: mocks.devices },
}));
import { Route } from "../../../src/routes/(app)/automations";
beforeEach(() => {
  mocks.account = null;
  mocks.list.mockClear();
  mocks.devices.mockClear();
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
async function page() {
  const root = createRootRoute({ component: Outlet });
  const tree = root.addChildren([
    createRoute({
      getParentRoute: () => root,
      path: "/automations",
      component: Route.options.component!,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/login",
      component: () => <h1>Sign in page</h1>,
    }),
  ]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ["/automations"] }),
  });
  await router.load();
  render(
    <BrowserLanguageProvider>
      <RouterProvider router={router} />
    </BrowserLanguageProvider>,
  );
  return router;
}
it("keeps cloud schedules private for guests and returns to automations after sign-in", async () => {
  const router = await page();
  expect(screen.getByRole("heading", { name: "Cloud automations" })).toBeTruthy();
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.devices).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("link", { name: "Sign in" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toMatchObject({ returnTo: "/automations" });
});
it("loads only the confirmed account's cloud view", async () => {
  mocks.account = "account-one";
  await page();
  expect(await screen.findByText("No cloud automations yet")).toBeTruthy();
  expect(mocks.list).toHaveBeenCalledTimes(1);
  expect(mocks.devices).toHaveBeenCalledTimes(1);
});
