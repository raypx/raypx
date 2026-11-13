/** @vitest-environment happy-dom */
import { BrowserLanguageProvider } from "../i18n.js";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recent: false,
  authorized: false,
  start: vi.fn(async () => ({ authorizationUrl: "https://api.example.test/authorize" })),
  wait: vi.fn(),
  cancel: vi.fn(async () => {}),
  open: vi.fn(async () => true),
  refetch: vi.fn(async () => {}),
  detach: vi.fn(),
  session: vi.fn(async () => true),
  enable: vi.fn(async () => true),
  attach: vi.fn(),
  refreshGrant: vi.fn(async () => ({ deviceId: "device", epoch: 1 })),
  local: vi.fn(async (_method: string) => []),
}));
vi.mock("./auth/client.js", () => ({
  apiUrl: "https://api.example.test",
  webUrl: "https://web.example.test",
  authClient: {
    getSession: async () => ({ data: { user: { id: "account" } }, error: null }),
    useSession: () => ({
      data: { user: { id: "account", email: "user@example.test" } },
      isPending: false,
      refetch: mocks.refetch,
    }),
  },
}));
vi.mock("./tasks/client.js", () => ({
  taskClient: { setAccount: vi.fn(), devices: { refreshGrant: mocks.refreshGrant } },
}));
vi.mock("./tasks/local-client.js", () => ({
  accountLocalTaskClient: { setAccount: vi.fn() },
}));
vi.mock("./tasks/terminal-settings.js", () => ({
  TerminalSettings: () => null,
}));
vi.mock("../lib/desktop.js", () => ({
  isDesktop: () => true,
  hasTerminalHooks: () => true,
  onLocalEvent: () => () => {},
  localRequest: mocks.local,
  getBridge: async () => ({
    request: {
      browserLoginStart: mocks.start,
      browserLoginWait: mocks.wait,
      browserLoginCancel: mocks.cancel,
      openExternal: mocks.open,
      controlSession: mocks.session,
      controlInfo: async () => ({
        daemon: true,
        enabled: true,
        connected: mocks.authorized,
        authorized: mocks.authorized,
        binding: { deviceId: "device", epoch: 1 },
        error: mocks.authorized ? null : "AUTH_REQUIRED",
      }),
      controlEnable: mocks.enable,
      controlAttach: mocks.attach,
      controlDetach: mocks.detach,
    },
  }),
}));
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { AgentSettings } from "./tasks/settings.js";
import { RemoteCoordinator } from "./tasks/coordinator.js";

beforeEach(() => {
  mocks.recent = false;
  mocks.authorized = false;
  mocks.wait.mockImplementation(async () => {
    mocks.recent = true;
  });
  mocks.attach.mockImplementation(async () => {
    if (!mocks.recent)
      throw Object.assign(new Error("Recent sign-in required"), { code: "UNAUTHORIZED" });
    mocks.authorized = true;
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function mount() {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <>
          <AgentSettings />
          <RemoteCoordinator />
        </>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <BrowserLanguageProvider>
      <RouterProvider router={router} />
    </BrowserLanguageProvider>,
  );
}
it("offers in-place authentication for a stale session and retries bootstrap without detaching work", async () => {
  mount();
  await waitFor(() => expect(mocks.attach).toHaveBeenCalledTimes(1));
  expect(mocks.detach).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Authorize this computer again" }));
  fireEvent.click(await screen.findByRole("button", { name: "Sign in with browser" }));
  await waitFor(() => expect(mocks.authorized).toBe(true));
  expect(mocks.start).toHaveBeenCalledExactlyOnceWith(
    { id: expect.any(String), webOrigin: "https://web.example.test", reauthorizeHost: true },
    { maxRequestTime: 35_000 },
  );
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith({ url: "https://api.example.test/authorize" });
  expect(mocks.refetch).toHaveBeenCalledTimes(1);
  expect(mocks.attach).toHaveBeenCalledTimes(2);
  expect(mocks.detach).not.toHaveBeenCalled();
  expect(mocks.local.mock.calls.every(([method]) => method !== "agents.local.detach")).toBe(true);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("retries an expired browser attempt and cancels the replacement when closed", async () => {
  mocks.wait.mockRejectedValueOnce(
    Object.assign(new Error("Expired"), { code: "DESKTOP_LOGIN_EXPIRED" }),
  );
  mocks.wait.mockImplementationOnce(() => new Promise(() => {}));
  mount();
  await waitFor(() => expect(mocks.attach).toHaveBeenCalledTimes(1));
  fireEvent.click(await screen.findByRole("button", { name: "Authorize this computer again" }));
  fireEvent.click(await screen.findByRole("button", { name: "Sign in with browser" }));
  await screen.findByText("This sign-in request expired. Start again to open a new request.");
  fireEvent.click(screen.getByRole("button", { name: "Sign in with browser" }));
  await screen.findByRole("status");
  fireEvent.click(screen.getByRole("button", { name: /^Close$/ }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.cancel).toHaveBeenCalledTimes(2);
  expect(mocks.refetch).not.toHaveBeenCalled();
  expect(mocks.attach).toHaveBeenCalledTimes(1);
});
