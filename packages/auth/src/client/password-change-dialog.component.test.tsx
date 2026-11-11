import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { PasswordChangeDialog } from "./password-change-dialog.js";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
afterEach(cleanup);

function fixture(onChanged = vi.fn(async () => {})) {
  const changePassword = vi.fn(
    async (): Promise<{ error: null | { code: string; message?: string } }> => ({ error: null }),
  );
  render(
    <BrowserLanguageProvider>
      <PasswordChangeDialog client={{ changePassword }} onChanged={onChanged} />
    </BrowserLanguageProvider>,
  );
  expect(screen.queryByLabelText("Current password")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  const current = screen.getByLabelText<HTMLInputElement>("Current password");
  const next = screen.getByLabelText<HTMLInputElement>("New password");
  const confirm = screen.getByLabelText<HTMLInputElement>("Confirm new password");
  for (const [input, value] of [
    [current, " current password "],
    [next, " replacement password "],
    [confirm, " replacement password "],
  ] as const)
    fireEvent.change(input, { target: { value } });
  return { changePassword, onChanged, current, next, confirm, form: current.closest("form")! };
}

it("changes the password once, defaults to revoking other sessions and clears every credential", async () => {
  const app = fixture();
  expect([app.current.minLength, app.next.minLength, app.confirm.minLength]).toEqual([1, 8, 8]);
  expect([app.current.maxLength, app.next.maxLength, app.confirm.maxLength]).toEqual([
    128, 128, 128,
  ]);
  expect([app.current.autocomplete, app.next.autocomplete, app.confirm.autocomplete]).toEqual([
    "current-password",
    "new-password",
    "new-password",
  ]);
  fireEvent.submit(app.form);
  fireEvent.submit(app.form);
  await screen.findByText("Password changed.");
  expect(screen.getByRole("heading", { name: "Password updated" })).toBeDefined();
  expect(app.changePassword).toHaveBeenCalledExactlyOnceWith({
    currentPassword: " current password ",
    newPassword: " replacement password ",
    revokeOtherSessions: true,
    fetchOptions: { signal: expect.any(AbortSignal) },
  });
  expect([app.current.value, app.next.value, app.confirm.value]).toEqual(["", "", ""]);
  expect(app.onChanged).toHaveBeenCalledTimes(1);
});

it("blocks mismatched passwords before requesting a change", async () => {
  const app = fixture();
  fireEvent.change(app.confirm, { target: { value: "different password" } });
  fireEvent.submit(app.form);
  expect(screen.getByRole("alert").textContent).toContain("do not match");
  expect(app.confirm.getAttribute("aria-invalid")).toBe("true");
  expect(app.changePassword).not.toHaveBeenCalled();
});

it("supports keeping other sessions and recovers from an incorrect current password", async () => {
  const app = fixture();
  app.changePassword.mockResolvedValueOnce({
    error: { code: "INVALID_PASSWORD", message: "private diagnostic" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.submit(app.form);
  await screen.findByText("Your current password is incorrect.");
  expect(app.current.value).toBe(" current password ");
  expect(app.current.getAttribute("aria-invalid")).toBe("true");
  expect(document.body.textContent).not.toContain("private diagnostic");
  expect(app.onChanged).not.toHaveBeenCalled();
  fireEvent.change(app.current, { target: { value: "correct password" } });
  fireEvent.submit(app.form);
  await screen.findByText("Password changed.");
  expect(app.changePassword).toHaveBeenLastCalledWith(
    expect.objectContaining({ currentPassword: "correct password", revokeOtherSessions: false }),
  );
});

it("retries account refresh without repeating a successful password change", async () => {
  const onChanged = vi.fn(async (): Promise<void> => {
    throw new Error("private diagnostic");
  });
  const app = fixture(onChanged);
  fireEvent.submit(app.form);
  await screen.findByText(/Your password changed, but account details could not reload/);
  expect(screen.queryByLabelText("Current password")).toBeNull();
  onChanged.mockResolvedValueOnce(undefined);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(app.changePassword).toHaveBeenCalledTimes(1);
  expect(onChanged).toHaveBeenCalledTimes(2);
});

it("discards credentials, validation and session choices when cancelled", async () => {
  const app = fixture();
  fireEvent.change(app.confirm, { target: { value: "different password" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.submit(app.form);
  expect(screen.getByRole("alert").textContent).toContain("do not match");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect([app.current.value, app.next.value, app.confirm.value]).toEqual(["", "", ""]);
  expect(app.changePassword).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  expect(screen.getByLabelText<HTMLInputElement>("Current password").value).toBe("");
  expect(screen.getByLabelText<HTMLInputElement>("New password").value).toBe("");
  expect(screen.getByLabelText<HTMLInputElement>("Confirm new password").value).toBe("");
  expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("prevents dismissal until the password change and account refresh finish", async () => {
  let finishChange!: (result: { error: null }) => void;
  let finishRefresh!: () => void;
  const onChanged = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishRefresh = resolve;
      }),
  );
  const app = fixture(onChanged);
  app.changePassword.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishChange = resolve;
      }),
  );
  fireEvent.submit(app.form);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Cancel" }).disabled).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Close" }).disabled).toBe(true);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  expect(screen.getByRole("dialog")).toBeTruthy();
  finishChange({ error: null });
  await screen.findByText("Password changed.");
  for (const button of screen.getAllByRole<HTMLButtonElement>("button", { name: "Close" }))
    expect(button.disabled).toBe(true);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  expect(screen.getByRole("dialog")).toBeTruthy();
  finishRefresh();
  await waitFor(() => {
    for (const button of screen.getAllByRole<HTMLButtonElement>("button", { name: "Close" }))
      expect(button.disabled).toBe(false);
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(app.changePassword).toHaveBeenCalledTimes(1);
  expect(onChanged).toHaveBeenCalledTimes(1);
});
