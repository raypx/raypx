/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { LocalEvent } from "@raypx/contracts/local";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  navigate: vi.fn(),
  listener: undefined as ((event: LocalEvent) => void) | undefined,
}));
vi.mock("../../../../src/features/tasks/local-client", () => ({
  localTaskClient: { observed: { list: mocks.list } },
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate: mocks.navigate }) }));
vi.mock("../../../../src/lib/desktop", () => ({
  onLocalEvent: (listener: (event: LocalEvent) => void) => {
    mocks.listener = listener;
    return () => {
      mocks.listener = undefined;
    };
  },
}));
import { TerminalRequestNotice } from "../../../../src/features/tasks/request-notice";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("opens this computer's approval page without deciding, and removes a stale notice", async () => {
  localStorage.setItem("raypx_locale", "en");
  let expiresAt = new Date(Date.now() + 300_000).toISOString();
  mocks.list.mockImplementation(async () => ({ requests: [{ status: "pending", expiresAt }] }));
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider>
        <TerminalRequestNotice accountId="account" />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  const button = await screen.findByRole("button", { name: "Review requests" });
  fireEvent.click(button);
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/approvals",
    search: { scope: "local" },
  });
  expiresAt = new Date(Date.now() - 1000).toISOString();
  mocks.listener?.({ version: 1, event: "observed.changed", data: {} });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Review requests" })).toBeNull());
});
