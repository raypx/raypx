import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { AuthForm, type AuthFormLinkProps, type AuthMode } from "./auth-form";
import type { AuthActionClient, AuthActionResponse } from "../hooks";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function fixture(mode: AuthMode, search = "", onSignedIn = vi.fn(async () => {})) {
  const action = () => vi.fn(async (): Promise<AuthActionResponse> => ({ error: null }));
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

it.each(["signup", "reset-password"] as const)(
  "shows live password length feedback for %s",
  (mode) => {
    fixture(mode, "?token=reset-token");
    const input = screen.getByLabelText<HTMLInputElement>(
      mode === "signup" ? "Password" : "New password",
    );
    const description = screen.getByText("Use 8–128 characters.");
    expect(input.getAttribute("aria-describedby")).toBe(description.id);
    fireEvent.change(input, { target: { value: "short" } });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(input, { target: { value: "new password" } });
    expect(screen.getByText("Password length meets the requirements.")).toBeDefined();
    expect(input.getAttribute("aria-invalid")).toBeNull();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("Use 8–128 characters.")).toBeDefined();
    expect(input.getAttribute("aria-invalid")).toBeNull();
  },
);

it.each(["forgot-password", "verify-email"] as const)(
  "prevents repeated %s mail sends until the cooldown expires",
  async (mode) => {
    vi.useFakeTimers();
    const { client } = fixture(mode);
    const send =
      mode === "forgot-password" ? client.requestPasswordReset : client.sendVerificationEmail;
    const email = screen.getByLabelText("Email address");
    fireEvent.change(email, { target: { value: "user@example.test" } });
    const form = email.closest("form")!;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Resend in 60s" }).disabled).toBe(
      true,
    );
    // Enter/programmatic submission must also respect the cooldown.
    fireEvent.submit(form);
    expect(send).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Resend in 1s" }).disabled).toBe(
      true,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: mode === "forgot-password" ? "Send reset link" : "Resend verification email",
      }).disabled,
    ).toBe(false);
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(send).toHaveBeenCalledTimes(2);
  },
);

it("keeps failed mail sends retryable without starting a cooldown", async () => {
  const { client } = fixture("forgot-password");
  client.requestPasswordReset.mockRejectedValueOnce(new Error("private diagnostic"));
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "user@example.test" },
  });
  const button = screen.getByRole<HTMLButtonElement>("button", { name: "Send reset link" });
  fireEvent.submit(button.closest("form")!);
  await screen.findByRole("alert");
  expect(button.disabled).toBe(false);
  expect(document.body.textContent).not.toContain("private diagnostic");
});

it("uses the server retry delay for mail rate limits and hides diagnostic messages", async () => {
  vi.useFakeTimers();
  const { client } = fixture("forgot-password");
  client.requestPasswordReset.mockImplementationOnce(async (...args: unknown[]) => {
    const input = args[0] as Parameters<AuthActionClient["requestPasswordReset"]>[0];
    input.fetchOptions.onError?.({
      response: new Response(null, { status: 429, headers: { "X-Retry-After": "90" } }),
    });
    return { error: { status: 429 } };
  });
  const email = screen.getByLabelText("Email address");
  fireEvent.change(email, { target: { value: "user@example.test" } });
  await act(async () => {
    fireEvent.submit(email.closest("form")!);
  });
  expect(screen.getByRole("alert").textContent).toContain("Too many attempts");
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Resend in 90s" }).disabled).toBe(
    true,
  );
  act(() => {
    vi.advanceTimersByTime(90_000);
  });
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Send reset link" }).disabled).toBe(
    false,
  );
});
