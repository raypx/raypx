import { BrowserLanguageProvider, messages } from "../../tests/i18n.js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLanguagePreference } from "@raypx/i18n/browser";
import {
  AuthForm,
  type AuthFormProps,
  type AuthFormLinkProps,
  type AuthMode,
} from "./auth-form.js";
import type { AuthActionClient, AuthActionResponse } from "../hooks.js";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function LanguageSwitch() {
  const { setPreference } = useLanguagePreference();
  return (
    <button type="button" onClick={() => setPreference("zh")}>
      中文
    </button>
  );
}

function fixture(
  mode: AuthMode,
  search = "",
  onSignedIn = vi.fn(async () => {}),
  socialLogin?: AuthFormProps["socialLogin"],
) {
  const action = () => vi.fn(async (): Promise<AuthActionResponse> => ({ error: null }));
  const client = {
    signIn: { email: action(), social: action() },
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
      <LanguageSwitch />
      <AuthForm
        mode={mode}
        socialLogin={socialLogin}
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
    expect(screen.getByRole("heading", { name: "Request a new link" })).toBeDefined();
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
  expect(screen.getByRole("heading", { name: "Password updated" })).toBeDefined();
  expect(password.value).toBe("");
  expect(screen.queryByLabelText("New password")).toBeNull();
  expect(screen.getByRole("link", { name: "Sign in" })).toBeDefined();
  expect(client.resetPassword).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ token: "reset-token", newPassword: " new password " }),
  );
});

it("replaces an already verified email form with a translated confirmation and sign-in action", async () => {
  const { client } = fixture("verify-email", "?verified=1&email=user%40example.test");
  expect(screen.getByRole("heading", { name: "Email verified" })).toBeDefined();
  expect(screen.getByRole("status").textContent).toBe(messages.en.auth.verified);
  expect(screen.queryByLabelText("Email address")).toBeNull();
  expect(screen.queryByRole("button", { name: "Resend verification email" })).toBeNull();
  expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
  expect(client.sendVerificationEmail).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "中文" }));
  await screen.findByRole("heading", { name: "邮箱已验证" });
  expect(screen.getByRole("status").textContent).toBe(messages.zh.auth.verified);
});

it("keeps unsubmitted credentials and field associations when changing language", async () => {
  const { client } = fixture("login");
  const email = screen.getByLabelText<HTMLInputElement>("Email address");
  const password = screen.getByLabelText<HTMLInputElement>("Password");
  fireEvent.change(email, { target: { value: "user@example.test" } });
  fireEvent.change(password, { target: { value: " unsubmitted password " } });
  fireEvent.click(screen.getByRole("button", { name: "中文" }));
  await screen.findByRole("heading", { name: "欢迎回来" });
  expect(screen.getByLabelText("邮箱地址")).toBe(email);
  expect(screen.getByLabelText("密码")).toBe(password);
  expect(email.value).toBe("user@example.test");
  expect(password.value).toBe(" unsubmitted password ");
  expect(client.signIn.email).not.toHaveBeenCalled();
});

it.each([
  { mode: "signup", message: "verifyIntro" },
  { mode: "forgot-password", message: "resetSent" },
  { mode: "reset-password", message: "resetSaved" },
  { mode: "verify-email", message: "verifySent" },
] as const)(
  "updates a successful $mode notice when the language changes",
  async ({ mode, message }) => {
    fixture(mode, "?token=reset-token");
    const email = screen.queryByLabelText("Email address");
    if (email) fireEvent.change(email, { target: { value: "user@example.test" } });
    const password = screen.queryByLabelText("New password") ?? screen.queryByLabelText("Password");
    if (password) fireEvent.change(password, { target: { value: "new password" } });
    const name = screen.queryByLabelText("Your name");
    if (name) fireEvent.change(name, { target: { value: "Ada" } });
    const form = screen
      .getByLabelText(mode === "reset-password" ? "New password" : "Email address")
      .closest("form")!;
    fireEvent.submit(form);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(messages.en.auth[message]),
    );
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(messages.zh.auth[message]),
    );
  },
);

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
  expect(screen.getByRole("heading", { name: "Signed in" })).toBeDefined();
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
    expect(input.minLength).toBe(8);
    expect(input.maxLength).toBe(128);
    expect(input.autocomplete).toBe("new-password");
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

it("keeps current-password inputs free of new-password validation", () => {
  fixture("login");
  const input = screen.getByLabelText<HTMLInputElement>("Password");
  expect(input.minLength).toBe(1);
  expect(input.maxLength).toBe(128);
  expect(input.autocomplete).toBe("current-password");
  fireEvent.change(input, { target: { value: "short" } });
  expect(input.getAttribute("aria-invalid")).toBeNull();
  expect(screen.queryByText("Use 8–128 characters.")).toBeNull();
});

it("renders unknown authentication errors with the shared generic message", async () => {
  const { client } = fixture("login");
  client.signIn.email.mockResolvedValueOnce({ error: { code: "PRIVATE_FAILURE" } });
  const input = screen.getByLabelText("Password");
  fireEvent.change(input, { target: { value: "password" } });
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(messages.en.common.error));
});

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
    expect(screen.getByLabelText<HTMLInputElement>("Email address").value).toBe(
      "user@example.test",
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
  expect(screen.getByRole("alert").textContent).toBe(messages.en.common.networkError);
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

const socialLogin = {
  providers: ["google", "github"] as const,
  callbackURL: "https://raypx.example/login?oauth=success&returnTo=%2Ftasks",
  errorCallbackURL: "https://raypx.example/login?returnTo=%2Ftasks",
};

it("starts a configured provider without submitting credentials and reports failures safely", async () => {
  const { client } = fixture("login", "", undefined, socialLogin);
  client.signIn.social.mockResolvedValueOnce({ error: { code: "PROVIDER_NOT_FOUND" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  await screen.findByRole("alert");
  expect(client.signIn.social).toHaveBeenCalledExactlyOnceWith({
    provider: "google",
    callbackURL: socialLogin.callbackURL,
    errorCallbackURL: socialLogin.errorCallbackURL,
    fetchOptions: { headers: { "Accept-Language": "en" } },
  });
  expect(client.signIn.email).not.toHaveBeenCalled();
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Continue with GitHub" }).disabled,
  ).toBe(false);
});

it("completes the OAuth return once and retries failed completion without restarting OAuth", async () => {
  const onSignedIn = vi.fn(async (): Promise<void> => {
    throw new Error("private diagnostic");
  });
  const { client } = fixture("login", "?oauth=success", onSignedIn, socialLogin);
  await screen.findByRole("button", { name: "Try again" });
  expect(onSignedIn).toHaveBeenCalledOnce();
  expect(client.signIn.social).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Password")).toBeNull();
  onSignedIn.mockResolvedValueOnce();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(2));
  expect(client.signIn.social).not.toHaveBeenCalled();
});

it("offers another attempt after cancelled OAuth without rendering provider diagnostics", () => {
  fixture("login", "?error=private-diagnostic", undefined, socialLogin);
  expect(screen.getByRole("alert").textContent).toContain("Sign-in was cancelled or failed");
  expect(screen.getByRole("alert").textContent).not.toContain("private-diagnostic");
  expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
});

it("completes an immediately admitted signup without asking for verification and retries only navigation", async () => {
  const complete = vi.fn(async () => {}).mockRejectedValueOnce(new Error("navigation unavailable"));
  const { client } = fixture("signup", "", complete);
  client.signUp.email.mockResolvedValue({ error: null, data: { token: "fixture-session-token" } });
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "No Mail" } });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "nomail@example.test" },
  });
  const password = screen.getByLabelText<HTMLInputElement>("Password");
  fireEvent.change(password, { target: { value: "fixture-password-123" } });
  fireEvent.submit(password.closest("form")!);
  await screen.findByText("You’re signed in, but the page could not load. Retry to continue.");
  expect(password.value).toBe("");
  expect(screen.queryByText(messages.en.auth.verifyIntro)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(2));
  expect(client.signUp.email).toHaveBeenCalledTimes(1);
});
