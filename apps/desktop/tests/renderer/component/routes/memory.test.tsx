/** @vitest-environment happy-dom */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as matchers from "@testing-library/jest-dom/matchers";
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
const mocks = vi.hoisted(() => ({
  request: vi.fn<(method: string, input: unknown) => Promise<unknown>>(),
  fetch: vi.fn(),
}));
vi.mock("../../../../src/lib/desktop", () => ({
  isDesktop: () => true,
  localRequest: mocks.request,
}));
vi.mock("../../../../src/features/auth/client", () => ({
  apiUrl: "https://api.example.test",
  desktopFetch: mocks.fetch,
  authClient: { useSession: () => ({ isPending: false, error: null, data: null }) },
}));
import { Route } from "../../../../src/routes/memory";
expect.extend(matchers);
beforeEach(() => {
  mocks.fetch.mockClear();
  mocks.request.mockReset();
  mocks.request.mockImplementation(async (method) =>
    method === "memory.list" ? [] : { id: "11111111-1111-4111-8111-111111111111", projects: [] },
  );
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function page() {
  const root = createRootRoute({ component: Outlet }),
    tree = root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: "/memory",
        component: Route.options.component!,
        validateSearch: Route.options.validateSearch,
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
it("keeps local references login-free and preserves a local form through the account gate", async () => {
  await page();
  expect(await screen.findByText(/No references match/)).toBeVisible();
  expect(mocks.request).toHaveBeenCalledWith("memory.list", {});
  expect(mocks.fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "New reference" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Device decisions" } });
  fireEvent.change(screen.getByLabelText("Reference content"), {
    target: { value: "Keep this on my computer" },
  });
  await userEvent.click(screen.getByRole("tab", { name: "Account" }));
  expect(await screen.findByRole("link", { name: "Sign in" })).toBeVisible();
  expect(mocks.fetch).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("tab", { name: "This computer" }));
  expect(screen.getByLabelText("Name")).toHaveValue("Device decisions");
  expect(screen.getByLabelText("Reference content")).toHaveValue("Keep this on my computer");
});
it("preserves the account-library destination through sign-in", async () => {
  const router = await page();
  await userEvent.click(screen.getByRole("tab", { name: "Account" }));
  fireEvent.click(await screen.findByRole("link", { name: "Sign in" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toMatchObject({ returnTo: "/memory?scope=account" });
});
