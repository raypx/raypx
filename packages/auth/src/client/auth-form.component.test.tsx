import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { AuthForm, type AuthFormLinkProps, type AuthMode } from "./auth-form";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
afterEach(cleanup);

function fixture(mode: AuthMode, search = "", onSignedIn = vi.fn(async () => {})) {
  const action = () =>
    vi.fn(async (): Promise<{ error: null | { code: string } }> => ({ error: null }));
  const client = {
    signIn: { email: action() },
    signUp: { email: action() },
    requestPasswordReset: action(),
    resetPassword: action(),
    sendVerificationEmail: action(),
    signOut: action(),
  };
  const Link = ({ to, children, className }: AuthFormLinkProps) => (
    <a href={`/${to}`} className={className}>
      {children}
    </a>
  );
  render(
    <BrowserLanguageProvider>
      <AuthForm
        mode={mode}
        search={search}
        webUrl="https://raypx.example"
        client={client}
        onSignedIn={onSignedIn}
        LinkComponent={Link}
      />
    </BrowserLanguageProvider>,
  );
  return { client, onSignedIn };
}

it.each(["", "?error=TOKEN_EXPIRED", "?token=old&error=TOKEN_EXPIRED"])(
  "offers a new reset link instead of a blocked form for %s",
  (search) => {
    fixture("reset-password", search);
    expect(screen.getByRole("alert").textContent).toContain("invalid or has expired");
    expect(screen.getByRole("link", { name: "Send reset link" }).getAttribute("href")).toBe(
      "/forgot-password",
    );
    expect(screen.queryByLabelText("New password")).toBeNull();
  },
);

it("clears credentials and replaces a completed reset with sign-in", async () => {
  const { client } = fixture("reset-password", "?token=reset-token");
  const password = screen.getByLabelText<HTMLInputElement>("New password");
  fireEvent.change(password, { target: { value: " new password " } });
  fireEvent.submit(password.closest("form")!);
  await screen.findByText("Password updated. You can sign in now.");
  expect(password.value).toBe("");
  expect(screen.queryByLabelText("New password")).toBeNull();
  expect(screen.getByRole("link", { name: "Sign in" })).toBeDefined();
  expect(client.resetPassword).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ token: "reset-token", newPassword: " new password " }),
  );
});

it("turns a rejected reset token into a new-link action", async () => {
  const { client } = fixture("reset-password", "?token=expired");
  client.resetPassword.mockResolvedValueOnce({ error: { code: "TOKEN_EXPIRED" } });
  const input = screen.getByLabelText("New password");
  fireEvent.change(input, { target: { value: "replacement password" } });
  fireEvent.submit(input.closest("form")!);
  await screen.findByRole("link", { name: "Send reset link" });
  expect(screen.queryByLabelText("New password")).toBeNull();
});

it("retries a failed page transition without signing in again or retaining the password", async () => {
  const onSignedIn = vi.fn(async (): Promise<void> => {
    throw new Error("private diagnostic");
  });
  const { client } = fixture("login", "", onSignedIn);
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "user@example.test" },
  });
  const password = screen.getByLabelText<HTMLInputElement>("Password");
  fireEvent.change(password, { target: { value: "login password" } });
  fireEvent.submit(password.closest("form")!);
  await screen.findByText(/You’re signed in, but the page could not load/);
  expect(password.value).toBe("");
  expect(screen.queryByLabelText("Password")).toBeNull();
  onSignedIn.mockResolvedValueOnce(undefined);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(client.signIn.email).toHaveBeenCalledTimes(1);
  expect(onSignedIn).toHaveBeenCalledTimes(2);
  expect(document.body.textContent).not.toContain("private diagnostic");
});
