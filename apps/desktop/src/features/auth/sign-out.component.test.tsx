/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { DesktopPlatformProvider } from "../../lib/platform-context.tsx";
import { desktopFixture, deferred } from "../../../tests/helpers/desktop.ts";
import { DesktopSignOutProvider, useDesktopSignOut } from "./sign-out.tsx";

expect.extend(matchers);
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), reset: vi.fn() }));
vi.mock("./client", () => ({
  webUrl: "https://app.example.test",
  authClient: { signOut: mocks.signOut },
}));
vi.mock("../analytics/client", () => ({ analytics: { reset: mocks.reset } }));

const views: (() => void)[] = [];
afterEach(() => {
  cleanup();
  for (const close of views.splice(0)) close();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.signOut.mockResolvedValue({});
  localStorage.setItem("raypx_locale", "en");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

function SignOutPage() {
  const auth = useDesktopSignOut();
  return (
    <button disabled={auth.busy} onClick={() => void auth.signOut("owner", "/login")}>
      Sign out
    </button>
  );
}
async function page() {
  const fixture = desktopFixture();
  const session = vi.fn(async () => true);
  const detach = vi.fn(async () => true);
  fixture.setNative("controlSession", session);
  fixture.setNative("controlDetach", detach);
  const root = createRootRoute({
    component: () => (
      <DesktopSignOutProvider>
        <Outlet />
      </DesktopSignOutProvider>
    ),
  });
  const history = createMemoryHistory({ initialEntries: ["/"] });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/", component: SignOutPage }),
      createRoute({
        getParentRoute: () => root,
        path: "/settings",
        component: () => <p>Settings</p>,
      }),
      createRoute({ getParentRoute: () => root, path: "/login", component: () => <p>Sign in</p> }),
    ]),
    history,
  });
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queries.setQueryData(["remote", "owner"], "private");
  queries.setQueryData(["local-history"], "preserve");
  views.push(() => {
    history.destroy();
    queries.clear();
  });
  await router.load();
  render(
    <QueryClientProvider client={queries}>
      <BrowserLanguageProvider>
        <DesktopPlatformProvider platform={fixture.platform}>
          <RouterProvider router={router} />
        </DesktopPlatformProvider>
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  return { ...fixture, router, queries, session, detach };
}

it.each(["manual", "online", "engine"] as const)(
  "retries host cleanup on %s after the initiating route unmounts without repeating web sign-out",
  async (recovery) => {
    const fixture = await page();
    fixture.session.mockRejectedValueOnce(new Error("private cleanup diagnostic"));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign-out is incomplete.");
    expect(screen.queryByText("private cleanup diagnostic")).toBeNull();
    expect(fixture.queries.getQueryData(["remote", "owner"])).toBeUndefined();
    expect(fixture.queries.getQueryData(["local-history"])).toBe("preserve");
    await act(async () => fixture.router.navigate({ to: "/settings" }));
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Sign-out is incomplete.");
    await act(async () => {
      if (recovery === "manual") fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      if (recovery === "online") window.dispatchEvent(new Event("online"));
      if (recovery === "engine")
        fixture.emit({ version: 1, event: "engine.status", data: { status: "ready" } });
    });
    await waitFor(() => expect(fixture.router.state.location.pathname).toBe("/login"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(fixture.session).toHaveBeenCalledTimes(2);
    expect(fixture.session).toHaveBeenLastCalledWith({ accountId: null });
    expect(fixture.detach).toHaveBeenCalledTimes(1);
    expect(fixture.queries.getQueryData(["local-history"])).toBe("preserve");
  },
);

it("retains the retry after detaching fails and deduplicates concurrent recovery signals", async () => {
  const fixture = await page();
  fixture.detach.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("alert");
  const pending = deferred<boolean>();
  fixture.detach.mockReturnValueOnce(pending.promise);
  await act(async () => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
    fixture.emit({ version: 1, event: "engine.status", data: { status: "ready" } });
  });
  await waitFor(() => expect(fixture.detach).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
  await act(async () => pending.resolve(true));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(mocks.signOut).toHaveBeenCalledTimes(1);
  expect(fixture.session).toHaveBeenCalledTimes(2);
  expect(fixture.detach).toHaveBeenCalledTimes(2);
});

it("keeps account caches and host authorization when web sign-out fails", async () => {
  mocks.signOut.mockResolvedValue({ error: { code: "UNAVAILABLE" } });
  const fixture = await page();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled());
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(fixture.session).not.toHaveBeenCalled();
  expect(fixture.detach).not.toHaveBeenCalled();
  expect(mocks.reset).not.toHaveBeenCalled();
  expect(fixture.queries.getQueryData(["remote", "owner"])).toBe("private");
  expect(fixture.router.state.location.pathname).toBe("/");
});

it("does not revoke host authorization merely on mounting or reconnecting", async () => {
  const fixture = await page();
  await fixture.platform.getBridge();
  await act(async () => {
    window.dispatchEvent(new Event("online"));
    fixture.emit({ version: 1, event: "engine.status", data: { status: "ready" } });
  });
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(fixture.session).not.toHaveBeenCalled();
  expect(fixture.detach).not.toHaveBeenCalled();
});
