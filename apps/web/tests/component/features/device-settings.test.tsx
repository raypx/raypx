import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeviceSettings } from "@raypx/tasks/client";
import type { SyncDevice } from "@raypx/tasks";
import type { TaskClient } from "@raypx/client";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});

function devices(failInitialRead = false) {
  const computer: SyncDevice = {
    id: crypto.randomUUID(),
    name: "Studio MacBook",
    platform: "darwin",
    appVersion: "1.0.0",
    epoch: 7,
    revoked: false,
    lastSeenAt: null,
    online: true,
    projects: [],
    capabilities: [],
  };
  const list = vi.fn(async () => [computer]);
  if (failInitialRead) list.mockRejectedValueOnce(new Error("private device diagnostic"));
  const revoke = vi.fn(async (_input: { deviceId: string; epoch: number }) => ({ ok: true }));
  const client = { devices: { list, revoke } } as unknown as TaskClient;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider>
        <DeviceSettings client={client} accountId="account" />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  return { list, revoke, computer };
}

it("can cancel disconnecting a computer without revoking its grant", async () => {
  const { revoke } = devices();
  fireEvent.click(await screen.findByRole("button", { name: "Disconnect computer" }));
  const dialog = await screen.findByRole("dialog", { name: "Disconnect computer" });
  expect(dialog).toHaveTextContent("Studio MacBook");
  expect(dialog).toHaveAccessibleDescription(/Existing files and changes will be preserved/);
  expect(revoke).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(revoke).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Disconnect computer" })).toBeEnabled();
});

it("revokes the selected computer only after confirmation and prevents duplicate requests", async () => {
  const { revoke, computer } = devices();
  let finish!: () => void;
  revoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ ok: true });
      }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Disconnect computer" }));
  const dialog = await screen.findByRole("dialog");
  const confirm = within(dialog).getByRole("button", { name: "Disconnect computer" });
  expect(revoke).not.toHaveBeenCalled();
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(revoke).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledWith(
    { deviceId: computer.id, epoch: 7 },
    { signal: expect.any(AbortSignal) },
  );
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(within(dialog).getByRole("button", { name: "Close" })).toBeDisabled();
  finish();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Disconnected" })).toBeDisabled();
});

it("keeps a failed disconnect open with a deliberate retry and safe feedback", async () => {
  const { revoke, computer } = devices();
  revoke.mockRejectedValueOnce(new Error("private disconnect diagnostic"));
  fireEvent.click(await screen.findByRole("button", { name: "Disconnect computer" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect computer" }));
  await within(dialog).findByRole("alert");
  expect(dialog).not.toHaveTextContent("private disconnect diagnostic");
  const retry = within(dialog).getByRole("button", { name: "Disconnect computer" });
  expect(retry).toBeEnabled();
  fireEvent.click(retry);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(revoke).toHaveBeenCalledTimes(2);
  expect(revoke.mock.calls[1]![0]).toEqual({ deviceId: computer.id, epoch: 7 });
});

it("replaces a failed device read with retry instead of staying in loading", async () => {
  const { list } = devices(true);
  await screen.findByRole("alert");
  expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  expect(screen.queryByText("private device diagnostic")).not.toBeInTheDocument();
  const retry = screen.getByRole("button", { name: "Try again" });
  expect(retry).toBeEnabled();
  fireEvent.click(retry);
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(screen.getByText("Studio MacBook")).toBeInTheDocument();
  expect(list).toHaveBeenCalledTimes(2);
});
