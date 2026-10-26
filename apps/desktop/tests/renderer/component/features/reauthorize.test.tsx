/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";

const mocks = vi.hoisted(() => ({
  recent: false,
  authorized: false,
  signIn: vi.fn(),
  refetch: vi.fn(async () => {}),
  detach: vi.fn(),
  session: vi.fn(async () => true),
  enable: vi.fn(async () => true),
  attach: vi.fn(),
  refreshGrant: vi.fn(async () => ({ deviceId: "device", epoch: 1 })),
  local: vi.fn(async (_method: string) => []),
}));
vi.mock("../../../../src/features/auth/client", () => ({
  apiUrl: "https://api.example.test",
  webUrl: "https://web.example.test",
  authClient: {
    signIn: { email: mocks.signIn },
    useSession: () => ({
      data: { user: { id: "account", email: "user@example.test" } },
      isPending: false,
      refetch: mocks.refetch,
    }),
  },
}));
vi.mock("../../../../src/features/tasks/client", () => ({
  taskClient: { setAccount: vi.fn(), devices: { refreshGrant: mocks.refreshGrant } },
}));
vi.mock("../../../../src/features/tasks/local-client", () => ({
  accountLocalTaskClient: { setAccount: vi.fn() },
}));
vi.mock("../../../../src/features/tasks/terminal-settings", () => ({
  TerminalSettings: () => null,
}));
vi.mock("../../../../src/lib/desktop", () => ({
  isDesktop: () => true,
  isDaemonDesktop: () => true,
  onLocalEvent: () => () => {},
  localRequest: mocks.local,
  getBridge: async () => ({
    request: {
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
import { AgentSettings } from "../../../../src/features/tasks/settings";
import { RemoteCoordinator } from "../../../../src/features/tasks/coordinator";

beforeEach(() => {
  mocks.recent = false;
  mocks.authorized = false;
  mocks.signIn.mockImplementation(async () => {
    mocks.recent = true;
    return { error: null };
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
  const email = await screen.findByLabelText<HTMLInputElement>("Email address");
  expect(email.readOnly).toBe(true);
  expect(email.value).toBe("user@example.test");
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(mocks.authorized).toBe(true));
  expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith({
    email: "user@example.test",
    password: "synthetic-password",
    fetchOptions: { headers: { "Accept-Language": "en" } },
  });
  expect(mocks.refetch).toHaveBeenCalledTimes(1);
  expect(mocks.attach).toHaveBeenCalledTimes(2);
  expect(mocks.detach).not.toHaveBeenCalled();
  expect(mocks.local.mock.calls.every(([method]) => method !== "agents.local.detach")).toBe(true);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("keeps failed authentication actionable and clears passwords on submission and cancellation", async () => {
  mocks.signIn.mockResolvedValue({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
  mount();
  await waitFor(() => expect(mocks.attach).toHaveBeenCalledTimes(1));
  fireEvent.click(await screen.findByRole("button", { name: "Authorize this computer again" }));
  const password = await screen.findByLabelText<HTMLInputElement>("Password");
  fireEvent.change(password, { target: { value: "wrong-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("The email or password is incorrect.");
  expect(password.value).toBe("");
  expect(mocks.refetch).not.toHaveBeenCalled();
  expect(mocks.attach).toHaveBeenCalledTimes(1);
  fireEvent.change(password, { target: { value: "cleared-on-cancel" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Authorize this computer again" }));
  });
  expect((await screen.findByLabelText<HTMLInputElement>("Password")).value).toBe("");
  expect(screen.queryByText("The email or password is incorrect.")).toBeNull();
});
