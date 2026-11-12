/** @vitest-environment happy-dom */
import { BrowserLanguageProvider } from "../../../i18n.js";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import type { InstanceBinding, InstanceStatus } from "@raypx/instances";
import { DesktopPlatformProvider } from "../../../lib/platform-context.js";
import { desktopFixture } from "../../../../tests/helpers/desktop.js";
import { InstanceGate } from "./instance-gate.js";
import { DesktopSignOutProvider } from "../sign-out.js";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  approve: vi.fn(),
  signOut: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("../client.js", () => ({
  apiUrl: "https://api.example.test",
  desktopFetch: vi.fn(),
  webUrl: "https://app.example.test",
  authClient: { useSession: mocks.session, signOut: mocks.signOut },
}));
vi.mock("../../analytics/client.js", () => ({ analytics: { reset: mocks.reset } }));
vi.mock("@raypx/client/api", () => ({
  createApiClient: () => ({ instances: { approve: mocks.approve } }),
}));
const binding: InstanceBinding = {
  version: 1,
  instanceId: "00000000-0000-4000-8000-000000000001",
  publicKey: "synthetic-public-key-for-component-test",
  name: "Test computer",
  platform: "test",
  appVersion: "test",
  origin: "https://api.example.test",
  accountId: "owner",
  revision: 1,
  status: "registered",
  issuedAt: "2026-11-04T00:00:00.000Z",
};
const views: (() => void)[] = [];
afterEach(() => {
  cleanup();
  for (const close of views.splice(0)) close();
  vi.clearAllMocks();
});
beforeEach(() => {
  localStorage.setItem("raypx_locale", "en");
  mocks.session.mockReturnValue({ data: null, error: new Error("offline"), isPending: false });
});
async function page(read: () => InstanceStatus) {
  const fixture = desktopFixture();
  fixture.setLocal("instance.status", read);
  fixture.setLocal("instance.refresh", read);
  fixture.setNative("controlSession", async () => true);
  fixture.setNative("controlDetach", async () => true);
  const root = createRootRoute({
    component: () => (
      <DesktopSignOutProvider>
        <InstanceGate>
          <p>Private local work</p>
        </InstanceGate>
      </DesktopSignOutProvider>
    ),
  });
  const history = createMemoryHistory({ initialEntries: ["/"] });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/login", component: () => null }),
    ]),
    history,
  });
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  return Object.assign(fixture, { router, queries });
}
it("allows a registered instance after online logout or a failed session read", async () => {
  await page(() => ({ state: "registered", binding }));
  expect(await screen.findByText("Private local work")).toBeTruthy();
});
it.each(["revoked", "unavailable"] as const)("blocks %s instances", async (state) => {
  await page(() => ({ state }));
  await screen.findByRole("heading");
  expect(screen.queryByText("Private local work")).toBeNull();
  expect(screen.queryByRole("link", { name: "Sign in to continue" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});
it("can recover from a failed instance status query", async () => {
  let available = false;
  await page(() => {
    if (!available) throw new Error("Instance status query failed");
    return { state: "registered", binding };
  });
  const retry = await screen.findByRole("button", { name: "Try again" });
  available = true;
  fireEvent.click(retry);
  expect(await screen.findByText("Private local work")).toBeTruthy();
});
it("blocks a different signed-in account before mounting local tools", async () => {
  mocks.session.mockReturnValue({ data: { user: { id: "other" } }, error: null, isPending: false });
  await page(() => ({ state: "registered", binding }));
  await screen.findByRole("heading");
  expect(screen.queryByText("Private local work")).toBeNull();
  expect(screen.queryByRole("link", { name: "Sign in to continue" })).toBeNull();
});
it("blocks a binding from a different server origin while offline", async () => {
  await page(() => ({
    state: "registered",
    binding: { ...binding, origin: "https://other.example.test" },
  }));
  await screen.findByRole("heading");
  expect(screen.queryByText("Private local work")).toBeNull();
});
it("signs out a mismatched account, detaches remote access and keeps the local identity", async () => {
  mocks.session.mockReturnValue({ data: { user: { id: "other" } }, error: null, isPending: false });
  const fixture = await page(() => ({ state: "registered", binding }));
  fixture.queries.setQueryData(["remote", "other"], "private");
  fixture.queries.setQueryData(["local-history"], "preserve");
  mocks.signOut.mockImplementation(async () => {
    mocks.session.mockReturnValue({ data: null, error: null, isPending: false });
    return {};
  });
  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  expect(await screen.findByText("Private local work")).toBeTruthy();
  await vi.waitFor(() =>
    expect(fixture.calls.some((call) => call.method === "controlDetach")).toBe(true),
  );
  expect(fixture.queries.getQueryData(["remote", "other"])).toBeUndefined();
  expect(fixture.queries.getQueryData(["local-history"])).toBe("preserve");
  expect(fixture.calls.some((call) => call.method === "instance.begin")).toBe(false);
});
it("keeps failed sign-out recoverable and opens login only after successful cleanup", async () => {
  mocks.session.mockReturnValue({ data: { user: { id: "other" } }, error: null, isPending: false });
  const fixture = await page(() => ({ state: "registered", binding }));
  mocks.signOut.mockRejectedValueOnce(new Error("private sign-out error")).mockResolvedValue({});
  fireEvent.click(await screen.findByRole("button", { name: "Sign in with the original account" }));
  await screen.findByRole("alert");
  expect(fixture.calls.some((call) => call.method === "controlDetach")).toBe(false);
  expect(fixture.router.state.location.pathname).toBe("/");
  fireEvent.click(screen.getByRole("button", { name: "Sign in with the original account" }));
  await vi.waitFor(() => expect(fixture.router.state.location.pathname).toBe("/login"));
  expect(fixture.calls.some((call) => call.method === "controlDetach")).toBe(true);
});
it.each([
  { data: null, error: null, isPending: true },
  { data: null, error: new Error("offline"), isPending: false },
])("does not prompt login while session state is pending or unavailable", async (session) => {
  mocks.session.mockReturnValue(session);
  await page(() => ({ state: "unregistered" }));
  await screen.findByRole("heading");
  expect(screen.queryByRole("link", { name: "Sign in to continue" })).toBeNull();
  expect(screen.queryByText("Private local work")).toBeNull();
});
it("offers sign-in to an unregistered signed-out instance", async () => {
  mocks.session.mockReturnValue({ data: null, error: null, isPending: false });
  await page(() => ({ state: "unregistered" }));
  const signIn = await screen.findByRole("link", { name: "Sign in to continue" });
  expect(signIn.getAttribute("href")).toBe("/login");
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});
it("approves enrollment using the native authenticated client before unlocking local tools", async () => {
  mocks.session.mockReturnValue({ data: { user: { id: "owner" } }, error: null, isPending: false });
  let registered = false;
  const fixture = await page(() =>
    registered ? { state: "registered", binding } : { state: "unregistered" },
  );
  fixture.setLocal("instance.begin", () => ({ registered: false, code: "ABCDEFGH23" }));
  fixture.setLocal("instance.poll", () => {
    registered = true;
    return { status: "approved" };
  });
  mocks.approve.mockResolvedValue({ approved: true });
  fireEvent.click(await screen.findByRole("button", { name: /register|bind/i }));
  expect(await screen.findByText("Private local work")).toBeTruthy();
  expect(mocks.approve).toHaveBeenCalledWith({ code: "ABCDEFGH23" });
});

it("retries the remote session without enrolling or treating an error as sign-out", async () => {
  const read = new Error("private session error");
  let finish!: () => void;
  const refetch = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  mocks.session.mockReturnValue({ data: null, error: read, isPending: false, refetch });
  const fixture = await page(() => ({ state: "unregistered" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Couldn’t check your sign-in status. Connect to the internet and try again.",
  );
  expect(screen.queryByText(/private session/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(refetch).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Loading…" }).hasAttribute("disabled")).toBe(true);
  expect(fixture.calls.some((call) => call.method === "instance.begin")).toBe(false);
  expect(mocks.approve).not.toHaveBeenCalled();
  mocks.session.mockReturnValue({ data: null, error: null, isPending: false, refetch });
  await act(async () => finish());
  expect(await screen.findByRole("link", { name: "Sign in to continue" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText("Private local work")).toBeNull();
});
it("keeps a failed remote-session retry available without leaking its transport error", async () => {
  const refetch = vi.fn().mockRejectedValue(new Error("private transport details"));
  mocks.session.mockReturnValue({
    data: null,
    error: new Error("offline"),
    isPending: false,
    refetch,
  });
  await page(() => ({ state: "unregistered" }));
  await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Try again" })));
  expect(screen.getByRole("button", { name: "Try again" }).hasAttribute("disabled")).toBe(false);
  expect(screen.queryByText(/private transport/)).toBeNull();
});
