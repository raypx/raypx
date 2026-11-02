import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { PasswordChangeForm } from "./password-change-form";

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
      <PasswordChangeForm client={{ changePassword }} onChanged={onChanged} />
    </BrowserLanguageProvider>,
  );
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
  fireEvent.submit(app.form);
  fireEvent.submit(app.form);
  await screen.findByText("Password changed.");
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
