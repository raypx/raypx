import { BrowserLanguageProvider } from "./i18n.js";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: null as string | null,
  spaces: vi.fn(async () => []),
  socket: vi.fn(),
}));
vi.mock("./features/auth/client.js", () => ({
  apiUrl: "https://api.example.test",
  authClient: {
    useSession: () => ({
      isPending: false,
      error: null,
      data: mocks.account ? { user: { id: mocks.account } } : null,
    }),
  },
}));
vi.mock("./features/agents/client.js", () => ({
  agentsClient: { spaces: { list: mocks.spaces } },
}));
vi.mock("./features/agents/socket.js", () => ({ desktopConversationSocket: mocks.socket }));
import { Route } from "./routes/agents.js";

beforeEach(() => {
  mocks.account = null;
  mocks.spaces.mockClear();
  mocks.socket.mockClear();
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
async function page(destination: string) {
  const root = createRootRoute({ component: Outlet });
  const tree = root.addChildren([
    createRoute({
      getParentRoute: () => root,
      path: "/agents",
      component: Route.options.component!,
      validateSearch: Route.options.validateSearch,
    }),
    createRoute({ getParentRoute: () => root, path: "/login", component: () => null }),
  ]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [destination] }),
  });
  await router.load();
  render(
    <BrowserLanguageProvider>
      <RouterProvider router={router} />
    </BrowserLanguageProvider>,
  );
  return router;
}
it("redirects guests to sign-in with the conversation return path before reads or socket creation", async () => {
  const destination =
    "/agents?spaceId=11111111-1111-4111-8111-111111111111&agentId=22222222-2222-4222-8222-222222222222";
  const router = await page(destination);
  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toMatchObject({ returnTo: destination });
  expect(mocks.spaces).not.toHaveBeenCalled();
  expect(mocks.socket).not.toHaveBeenCalled();
});
it("injects the account-bound native socket into the shared workspace after login", async () => {
  mocks.account = "owner";
  await page("/agents");
  expect(await screen.findByRole("heading", { name: "Agents", level: 1 })).toBeTruthy();
  await waitFor(() => expect(mocks.spaces).toHaveBeenCalledOnce());
  expect(mocks.socket).toHaveBeenCalledWith("owner");
});
