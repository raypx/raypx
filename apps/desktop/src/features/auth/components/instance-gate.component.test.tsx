/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { InstanceGate } from "./instance-gate";
const mocks = vi.hoisted(() => ({ request: vi.fn(), session: vi.fn(), approve: vi.fn() }));
vi.mock("../../../lib/desktop", () => ({ isDesktop: () => true, localRequest: mocks.request }));
vi.mock("../client", () => ({
  apiUrl: "https://api.example.test",
  desktopFetch: vi.fn(),
  authClient: { useSession: mocks.session },
}));
vi.mock("@raypx/client", () => ({
  createApiClient: () => ({ instances: { approve: mocks.approve } }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/login">{children}</a>,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
beforeEach(() => {
  localStorage.setItem("raypx_locale", "en");
  mocks.session.mockReturnValue({ data: null, error: new Error("offline"), isPending: false });
});
function page() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider>
        <InstanceGate>
          <p>Private local work</p>
        </InstanceGate>
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
}
it("allows a registered instance after online logout or a failed session read", async () => {
  mocks.request.mockResolvedValue({
    state: "registered",
    binding: { origin: "https://api.example.test", accountId: "owner" },
  });
  page();
  expect(await screen.findByText("Private local work")).toBeTruthy();
});
it.each(["revoked", "unavailable"])("blocks %s instances", async (state) => {
  mocks.request.mockResolvedValue({ state });
  page();
  await screen.findByRole("heading");
  expect(screen.queryByText("Private local work")).toBeNull();
});
it("blocks a different signed-in account before mounting local tools", async () => {
  mocks.session.mockReturnValue({ data: { user: { id: "other" } }, error: null, isPending: false });
  mocks.request.mockResolvedValue({
    state: "registered",
    binding: { origin: "https://api.example.test", accountId: "owner" },
  });
  page();
  await screen.findByRole("heading");
  expect(screen.queryByText("Private local work")).toBeNull();
});
it("approves enrollment using the native authenticated client before unlocking local tools", async () => {
  mocks.session.mockReturnValue({ data: { user: { id: "owner" } }, error: null, isPending: false });
  let registered = false;
  mocks.request.mockImplementation(async (method) => {
    if (method === "instance.begin") return { registered: false, code: "ABCDEFGH23" };
    if (method === "instance.poll") {
      registered = true;
      return { status: "approved" };
    }
    return registered
      ? { state: "registered", binding: { accountId: "owner", origin: "https://api.example.test" } }
      : { state: "unregistered" };
  });
  mocks.approve.mockResolvedValue({ approved: true });
  page();
  fireEvent.click(await screen.findByRole("button", { name: /register|bind/i }));
  expect(await screen.findByText("Private local work")).toBeTruthy();
  expect(mocks.approve).toHaveBeenCalledWith({ code: "ABCDEFGH23" });
});
