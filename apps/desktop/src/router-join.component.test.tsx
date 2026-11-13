import { useSyncExternalStore } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import { spaceIdSchema } from "@raypx/core/spaces";
import { BrowserLanguageProvider } from "./i18n.js";

expect.extend(matchers);

const mocks = vi.hoisted(() => ({
  session: {
    data: null as { user: { id: string } } | null,
    isPending: false,
    error: null as Error | null,
  },
  listeners: new Set<() => void>(),
  refetch: vi.fn(async () => {}),
  preview: vi.fn(),
  accept: vi.fn(),
}));
vi.mock("./features/auth/client.js", () => ({
  authClient: {
    useSession: () => ({
      ...useSyncExternalStore(
        (listener) => {
          mocks.listeners.add(listener);
          return () => {
            mocks.listeners.delete(listener);
          };
        },
        () => mocks.session,
      ),
      refetch: mocks.refetch,
    }),
  },
}));
vi.mock("./features/agents/client.js", () => ({
  agentsClient: { spaces: { previewInvitation: mocks.preview, acceptInvitation: mocks.accept } },
}));
vi.mock("./features/auth/components/browser-login.js", () => ({
  BrowserAuthorization: ({ onAuthorized }: { onAuthorized: () => Promise<void> }) => (
    <button
      type="button"
      onClick={() => {
        session("second");
        void onAuthorized();
      }}
    >
      Authorize in browser
    </button>
  ),
}));
import { Route } from "./routes/join.js";

const token = "a".repeat(64);
const spaceId = spaceIdSchema.parse("team");
const time = "2026-11-14T00:00:00.000Z";
const space = { id: spaceId, name: "Team", createdAt: time, updatedAt: time };
const preview = {
  spaceId,
  spaceName: "Team",
  inviterName: "Alex",
  expiresAt: "2026-11-21T00:00:00.000Z",
  alreadyMember: false,
  shares: ["agents", "conversations", "memory", "routines", "team_computer", "pages"],
};
function session(accountId: string | null) {
  mocks.session = {
    data: accountId ? { user: { id: accountId } } : null,
    isPending: false,
    error: null,
  };
  for (const listener of mocks.listeners) listener();
}
async function page() {
  const root = createRootRoute();
  const tree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: "/join", component: Route.options.component! }),
    createRoute({
      getParentRoute: () => root,
      path: "/agents",
      component: () => <p>Agents destination</p>,
      validateSearch: (search) => search,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/login",
      component: () => <p>Sign-in destination</p>,
    }),
  ]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [`/join#${token}`] }),
  });
  await router.load();
  await act(async () => {
    render(
      <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
        <RouterProvider router={router} />
      </BrowserLanguageProvider>,
    );
  });
  return router;
}
beforeEach(() => {
  session(null);
  mocks.refetch.mockClear();
  mocks.preview.mockReset().mockResolvedValue(preview);
  mocks.accept.mockReset().mockResolvedValue({
    space,
    member: { spaceId, accountId: "second", role: "member", createdAt: time },
    joined: true,
  });
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);

it("keeps a guest invitation in the fragment while browser authorization runs inline", async () => {
  const router = await page();
  expect(await screen.findByRole("button", { name: "Authorize in browser" })).toBeVisible();
  expect(router.state.location.pathname).toBe("/join");
  expect(router.state.location.hash).toBe(token);
  expect(router.state.location.search).toEqual({});
  expect(mocks.preview).not.toHaveBeenCalled();
  expect(mocks.accept).not.toHaveBeenCalled();
  expect(
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
  ).not.toContain(token);
  fireEvent.click(screen.getByRole("button", { name: "Authorize in browser" }));
  expect(await screen.findByRole("heading", { name: "Team" })).toBeVisible();
  expect(router.state.location.hash).toBe(token);
  await waitFor(() => expect(mocks.refetch).toHaveBeenCalledOnce());
});

it("previews after sign-in and switches to the accepted Space", async () => {
  const router = await page();
  await act(async () => session("second"));
  expect(await screen.findByRole("heading", { name: "Team" })).toBeVisible();
  expect(mocks.preview).toHaveBeenCalledWith({ token });
  expect(mocks.accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Join Space" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/agents"));
  expect(router.state.location.search).toMatchObject({ spaceId });
  expect(router.state.location.hash).toBe("");
  expect(mocks.accept).toHaveBeenCalledWith({ token });
});

it("discards a former account's pending invitation preview on account change", async () => {
  let finish!: (value: typeof preview) => void;
  mocks.preview.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  session("first");
  await page();
  await waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce());
  await act(async () => session("second"));
  await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole("heading", { name: "Team" })).toBeVisible();
  await act(async () => finish({ ...preview, spaceName: "Former account preview" }));
  expect(screen.queryByRole("heading", { name: "Former account preview" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Team" })).toBeVisible();
  expect(mocks.accept).not.toHaveBeenCalled();
});
