/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import type { InstanceBinding, InstanceStatus } from "@raypx/instances";
import { DesktopPlatformProvider } from "../../../lib/platform-context";
import { desktopFixture } from "../../../../tests/helpers/desktop";
import { InstanceGate } from "./instance-gate";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  approve: vi.fn(),
  signOut: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("../client", () => ({
  apiUrl: "https://api.example.test",
  desktopFetch: vi.fn(),
  webUrl: "https://app.example.test",
  authClient: { useSession: mocks.session, signOut: mocks.signOut },
}));
vi.mock("../../analytics/client", () => ({ analytics: { reset: mocks.reset } }));
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
      <InstanceGate>
        <p>Private local work</p>
      </InstanceGate>
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
it.each(["revoked", "unavailable"] as const)(
  "blocks %s instances with a retry action",
  async (state) => {
    await page(() => ({ state }));
    await screen.findByRole("heading");
    expect(screen.queryByText("Private local work")).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  },
);
it("blocks a different signed-in account before mounting local tools", async () => {
  mocks.session.mockReturnValue({ data: { user: { id: "other" } }, error: null, isPending: false });
  await page(() => ({ state: "registered", binding }));
  await screen.findByRole("heading");
  expect(screen.queryByText("Private local work")).toBeNull();
  expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
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
  expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  expect(screen.queryByText("Private local work")).toBeNull();
});
it("offers sign-in to an unregistered signed-out instance", async () => {
  mocks.session.mockReturnValue({ data: null, error: null, isPending: false });
  await page(() => ({ state: "unregistered" }));
  expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy();
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
