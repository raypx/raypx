import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { AccountSessions } from "../../../src/features/auth/components/account-sessions";
import { ProfileSettings } from "../../../src/features/auth/components/profile-settings";
import type { authClient } from "../../../src/features/auth/client";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});

function sessions() {
  const fixture = (id: string) => ({
    id,
    userId: "account",
    token: `private-token-${id}`,
    createdAt: new Date("2026-10-01T10:00:00Z"),
    updatedAt: new Date("2026-10-01T10:00:00Z"),
    expiresAt: new Date("2026-11-01T10:00:00Z"),
    userAgent:
      id === "current" ? "Mozilla/5.0 Macintosh Chrome/130.0" : "Mozilla/5.0 Windows Firefox/130.0",
  });
  const listSessions = vi.fn(async () => ({
    data: [fixture("other"), fixture("current")],
    error: null,
  }));
  const revokeSession = vi.fn(async () => ({ data: { status: true }, error: null }));
  const revokeOtherSessions = vi.fn(async () => ({ data: { status: true }, error: null }));
  const client = {
    listSessions,
    revokeSession,
    revokeOtherSessions,
  } as unknown as typeof authClient;
  render(
    <BrowserLanguageProvider>
      <AccountSessions client={client} currentSessionId="current" />
    </BrowserLanguageProvider>,
  );
  return { listSessions, revokeSession, revokeOtherSessions };
}

it("marks the current session, keeps tokens out of markup and confirms revocation", async () => {
  const { revokeSession } = sessions();
  await screen.findByText("This session");
  expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Chrome · macOS");
  expect(document.body.innerHTML).not.toContain("private-token");
  fireEvent.click(screen.getByRole("button", { name: "Sign out session" }));
  const dialog = await screen.findByRole("dialog", { name: "Sign out session" });
  expect(revokeSession).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Sign out session" }));
  await waitFor(() => expect(screen.queryByText("Firefox · Windows")).not.toBeInTheDocument());
  expect(revokeSession).toHaveBeenCalledWith({
    token: "private-token-other",
    fetchOptions: { signal: expect.any(AbortSignal) },
  });
  expect(screen.getByText("This session")).toBeInTheDocument();
});

it("can cancel signing out other sessions without sending a request", async () => {
  const { revokeOtherSessions } = sessions();
  fireEvent.click(await screen.findByRole("button", { name: "Sign out all other sessions" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(revokeOtherSessions).not.toHaveBeenCalled();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});

it("signs out all other sessions while preserving the current session", async () => {
  const { revokeOtherSessions } = sessions();
  fireEvent.click(await screen.findByRole("button", { name: "Sign out all other sessions" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Sign out all other sessions" }));
  await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
  expect(revokeOtherSessions).toHaveBeenCalledTimes(1);
  expect(screen.getByText("This session")).toBeInTheDocument();
});

it("recovers a session read failure and never renders private diagnostics", async () => {
  const { listSessions } = sessions();
  await screen.findByText("This session");
  listSessions.mockRejectedValueOnce(new Error("private diagnostic"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("private diagnostic")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
});

it("keeps a failed session revocation open for a deliberate retry", async () => {
  const { revokeSession } = sessions();
  revokeSession.mockRejectedValueOnce(new Error("private diagnostic"));
  fireEvent.click(await screen.findByRole("button", { name: "Sign out session" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Sign out session" }));
  await within(dialog).findByRole("alert");
  expect(dialog).not.toHaveTextContent("private diagnostic");
  expect(screen.getAllByRole("listitem", { hidden: true })).toHaveLength(2);
  fireEvent.click(within(dialog).getByRole("button", { name: "Sign out session" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(revokeSession).toHaveBeenCalledTimes(2);
});

it("saves a trimmed display name once and keeps the saved state if reloading fails", async () => {
  const updateUser = vi.fn(async () => ({ data: { status: true }, error: null }));
  const onSaved = vi.fn(async () => {
    throw new Error("Reload failed");
  });
  render(
    <BrowserLanguageProvider>
      <ProfileSettings
        client={{ updateUser } as unknown as typeof authClient}
        name="Original"
        onSaved={onSaved}
      />
    </BrowserLanguageProvider>,
  );
  const input = screen.getByRole("textbox", { name: "Display name" });
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  fireEvent.change(input, { target: { value: "  Updated  " } });
  fireEvent.submit(input.closest("form")!);
  fireEvent.submit(input.closest("form")!);
  await screen.findByText(/Your name was saved/);
  expect(updateUser).toHaveBeenCalledTimes(1);
  expect(updateUser).toHaveBeenCalledWith({
    name: "Updated",
    fetchOptions: { signal: expect.any(AbortSignal) },
  });
  expect(input).toHaveValue("Updated");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

it("preserves an edited name when the save fails", async () => {
  const updateUser = vi.fn(async () => ({
    error: { code: "PRIVATE_ERROR", message: "private diagnostic" },
  }));
  render(
    <BrowserLanguageProvider>
      <ProfileSettings
        client={{ updateUser } as unknown as typeof authClient}
        name="Original"
        onSaved={vi.fn()}
      />
    </BrowserLanguageProvider>,
  );
  const input = screen.getByRole("textbox", { name: "Display name" });
  fireEvent.change(input, { target: { value: "Updated" } });
  fireEvent.submit(input.closest("form")!);
  await screen.findByRole("alert");
  expect(input).toHaveValue("Updated");
  expect(document.body).not.toHaveTextContent("private diagnostic");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
});
