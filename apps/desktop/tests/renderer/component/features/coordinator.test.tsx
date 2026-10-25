/** @vitest-environment jsdom */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  session: { data: null as { user: { id: string } } | null, isPending: false },
  sessionRequest: vi.fn(async () => true),
  detach: vi.fn(async () => true),
  local: vi.fn(async () => true),
  info: vi.fn(async () => ({ daemon: true, authorized: true, enabled: true })),
}));
vi.mock("../../../../src/features/auth/client", () => ({
  apiUrl: "https://api.example.test",
  authClient: { useSession: () => mocks.session },
}));
vi.mock("../../../../src/features/tasks/client", () => ({ taskClient: { setAccount: vi.fn() } }));
vi.mock("../../../../src/features/tasks/local-client", () => ({
  localTaskClient: { setAccount: vi.fn() },
}));
vi.mock("../../../../src/lib/desktop", () => ({
  isDesktop: () => true,
  isDaemonDesktop: () => true,
  localRequest: mocks.local,
  onLocalEvent: () => () => {},
  getBridge: async () => ({
    request: {
      controlSession: mocks.sessionRequest,
      controlDetach: mocks.detach,
      controlInfo: mocks.info,
    },
  }),
}));
import { RemoteCoordinator } from "../../../../src/features/tasks/coordinator";
import { signOutDesktopHost } from "../../../../src/features/tasks/host-session";

afterEach(() => {
  cleanup();
  mocks.session.data = null;
  vi.clearAllMocks();
});
it("preserves independent authorization across cookie expiry and renderer unmount", async () => {
  const view = render(<RemoteCoordinator />);
  expect(mocks.sessionRequest).not.toHaveBeenCalled();
  mocks.session.data = { user: { id: "account-a" } };
  view.rerender(<RemoteCoordinator />);
  await waitFor(() => expect(mocks.info).toHaveBeenCalled());
  expect(mocks.sessionRequest).toHaveBeenCalledExactlyOnceWith({ accountId: "account-a" });
  mocks.session.data = null;
  view.rerender(<RemoteCoordinator />);
  view.unmount();
  expect(mocks.detach).not.toHaveBeenCalled();
  expect(mocks.local).not.toHaveBeenCalled();
  expect(mocks.sessionRequest).toHaveBeenCalledTimes(1);
});
it("revokes authorization and cancels account work on explicit sign-out", async () => {
  await signOutDesktopHost("account-a");
  expect(mocks.sessionRequest).toHaveBeenCalledWith({ accountId: null });
  expect(mocks.detach).toHaveBeenCalledTimes(1);
  expect(mocks.local).toHaveBeenCalledWith("agents.local.detach", { accountId: "account-a" });
});
