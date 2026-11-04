/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import type { InstanceBinding, InstanceStatus } from "@raypx/instances";
import { DesktopPlatformProvider } from "../../../lib/platform-context";
import { desktopFixture } from "../../../../tests/helpers/desktop";
import { InstanceGate } from "./instance-gate";

const mocks = vi.hoisted(() => ({ session: vi.fn(), approve: vi.fn() }));
vi.mock("../client", () => ({
  apiUrl: "https://api.example.test",
  desktopFetch: vi.fn(),
  authClient: { useSession: mocks.session },
}));
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
  const root = createRootRoute({
    component: () => (
      <InstanceGate>
        <p>Private local work</p>
      </InstanceGate>
    ),
  });
  const history = createMemoryHistory({ initialEntries: ["/"] });
  const router = createRouter({ routeTree: root, history });
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
  return fixture;
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
