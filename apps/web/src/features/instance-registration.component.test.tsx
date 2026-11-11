import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { InstanceRegistration } from "./auth/components/instance-registration.js";

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  approve: vi.fn(),
  list: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("@raypx/client/api", () => ({ createApiClient: () => ({ instances: mocks }) }));
vi.mock("./auth/client.js", () => ({ apiUrl: "https://account.example" }));
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem("raypx_locale", "en");
  mocks.list.mockResolvedValue([]);
});
function page() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider>
        <InstanceRegistration accountId="owner" />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
}
it("reviews device metadata and waits for explicit approval", async () => {
  mocks.inspect.mockResolvedValue({
    instanceId: "fixture-instance",
    name: "Test machine",
    platform: "linux",
    appVersion: "0.1.0",
  });
  mocks.approve.mockResolvedValue({ approved: true });
  page();
  fireEvent.change(screen.getByRole("textbox", { name: "Instance code" }), {
    target: { value: "abcdefgh23" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review instance" }));
  await screen.findByText(/Test machine/);
  expect(mocks.approve).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Approve registration" }));
  await screen.findByText("Instance registered");
  expect(mocks.approve).toHaveBeenCalledWith({ code: "ABCDEFGH23" });
});
it("confirms revocation and updates only after the server acknowledgement", async () => {
  const instance = {
    instanceId: "fixture-instance",
    name: "Test machine",
    platform: "linux",
    status: "registered",
  };
  mocks.list.mockImplementation(async () => [instance]);
  mocks.revoke.mockImplementation(async () => {
    instance.status = "revoked";
    return { revoked: true };
  });
  page();
  fireEvent.click(await screen.findByRole("button", { name: "Revoke instance" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Revoke instance" });
  expect(mocks.revoke).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Revoke instance" }));
  await waitFor(() =>
    expect(mocks.revoke).toHaveBeenCalledWith({ instanceId: "fixture-instance" }),
  );
  await screen.findByText("Revoked");
  expect(screen.queryByRole("button", { name: "Revoke instance" })).not.toBeInTheDocument();
});
it("does not display private server diagnostics for a failed inspection", async () => {
  mocks.inspect.mockRejectedValue(new Error("private-account-diagnostic"));
  page();
  fireEvent.change(screen.getByRole("textbox", { name: "Instance code" }), {
    target: { value: "ABCDEFGH23" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review instance" }));
  await screen.findByRole("alert");
  expect(document.body.textContent).not.toContain("private-account-diagnostic");
  expect(mocks.approve).not.toHaveBeenCalled();
});
