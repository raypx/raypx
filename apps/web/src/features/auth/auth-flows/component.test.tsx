/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, FormEvent, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  capabilities: {
    registrationAvailable: true,
    verificationEmailRequestAvailable: true,
    passwordResetRequestAvailable: true,
  },
  navigate: vi.fn(),
  notifyAuthFailure: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  verifyEmail: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  Outlet: () => null,
  useHydrated: () => true,
  useNavigate: () => mocks.navigate,
}));

vi.mock("@voidmix/i18n/client", async () => {
  const { default: messages } = await import("../../../../messages/en.json");
  return {
    useTranslations: (namespace: keyof typeof messages) => (key: string) => {
      const catalog = messages[namespace] as Record<string, unknown>;
      return catalog[key] ?? key;
    },
  };
});

vi.mock("../../../lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: mocks.requestPasswordReset,
    resetPassword: mocks.resetPassword,
    verifyEmail: mocks.verifyEmail,
  },
  signIn: { email: mocks.signInEmail },
  signUp: { email: mocks.signUpEmail },
}));

vi.mock("../feedback", () => ({
  notifyAuthFailure: mocks.notifyAuthFailure,
}));

vi.mock("../capabilities", () => ({
  useAuthCapabilities: () => mocks.capabilities,
}));

import { AuthForm } from "../auth-form";
import { PasswordField } from "../password-field";
import { ResetPassword } from "../reset-password";
import { VerifyEmail } from "../verify-email";

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  mocks.capabilities.registrationAvailable = true;
  mocks.capabilities.verificationEmailRequestAvailable = true;
  mocks.capabilities.passwordResetRequestAvailable = true;
  mocks.navigate.mockResolvedValue(undefined);
  mocks.notifyAuthFailure.mockReturnValue("Unable to complete authentication.");
});

async function submitCredentials(
  props: ComponentProps<typeof AuthForm> = { mode: "login" },
  password = "password123",
) {
  const user = userEvent.setup();
  render(<AuthForm {...props} />);
  await user.type(screen.getByRole("textbox", { name: "Email" }), "owner@example.com");
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("authentication forms", () => {
  it.each([
    ["opens cloud conversations", undefined, "/chat"],
    ["returns to the requested workspace", "/admin?tab=users", "/admin?tab=users"],
  ])("signs in with email credentials and %s", async (_name, redirectTo, destination) => {
    mocks.signInEmail.mockResolvedValue({ data: {}, error: null });
    await submitCredentials({ mode: "login", ...(redirectTo ? { redirectTo } : {}) });
    await waitFor(() => {
      expect(mocks.signInEmail).toHaveBeenCalledWith({
        email: "owner@example.com",
        password: "password123",
      });
      expect(mocks.navigate).toHaveBeenCalledWith({ to: destination });
    });
  });

  it("supports embedded login success callbacks without navigating", async () => {
    mocks.signInEmail.mockResolvedValue({ data: {}, error: null });
    const onSuccess = vi.fn();
    await submitCredentials({ mode: "login", onSuccess });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("creates an account and opens the verification state", async () => {
    mocks.signUpEmail.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    render(<AuthForm mode="signup" />);

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Ada Lovelace");
    await user.type(screen.getByRole("textbox", { name: "Email" }), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(mocks.signUpEmail).toHaveBeenCalledWith({
        email: "ada@example.com",
        name: "Ada Lovelace",
        password: "password123",
        callbackURL: expect.stringMatching(/\/verify-email\?verified=1$/),
      });
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/verify-email" });
    });
  });

  it("keeps authentication failures visible and does not navigate", async () => {
    mocks.signInEmail.mockResolvedValue({ data: null, error: { message: "Invalid credentials" } });
    mocks.notifyAuthFailure.mockReturnValue("Invalid credentials");
    await submitCredentials({ mode: "login" }, "incorrect-password");

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid credentials");
    expect(mocks.notifyAuthFailure).toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("hides unavailable registration and password reset entry points", () => {
    mocks.capabilities.registrationAvailable = false;
    mocks.capabilities.passwordResetRequestAvailable = false;

    render(<AuthForm mode="login" />);

    expect(screen.queryByRole("link", { name: "Create account" })).not.toBeInTheDocument();
    expect(screen.queryByText("Already have an account?")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Forgot password?" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  it("shows an unavailable state instead of the registration form", () => {
    mocks.capabilities.registrationAvailable = false;

    render(<AuthForm mode="signup" />);

    expect(screen.getByRole("heading", { name: "Registration unavailable" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
  });

  it("toggles password visibility without submitting the form", async () => {
    const submit = vi.fn((event: FormEvent) => event.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={submit}>
        <PasswordField id="test-password" label="Password" />
      </form>,
    );

    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("password reset and email verification", () => {
  it("requests a reset link and renders the non-enumerating success state", async () => {
    mocks.requestPasswordReset.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    render(<ResetPassword />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "owner@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeVisible();
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
      email: "owner@example.com",
      redirectTo: expect.stringMatching(/\/reset-password$/),
    });
  });

  it("shows an unavailable state for a tokenless reset request", () => {
    mocks.capabilities.passwordResetRequestAvailable = false;

    render(<ResetPassword />);

    expect(screen.getByRole("heading", { name: "Password reset unavailable" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send reset link" })).not.toBeInTheDocument();
  });

  it("keeps an existing reset token usable when email requests are disabled", () => {
    mocks.capabilities.passwordResetRequestAvailable = false;

    render(<ResetPassword token="existing-reset-token" />);

    expect(screen.getByRole("heading", { name: "Set a new password" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Update password" })).toBeVisible();
  });

  it("verifies a token and exposes the completed state", async () => {
    mocks.verifyEmail.mockResolvedValue({ data: {}, error: null });
    render(<VerifyEmail token="verification-token" />);

    expect(screen.getByRole("heading", { name: "Verifying your email" })).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Email verified" })).toBeVisible();
    expect(mocks.verifyEmail).toHaveBeenCalledWith({
      query: { token: "verification-token" },
    });
  });

  it("renders the completed state when Better Auth redirects after verification", () => {
    render(<VerifyEmail redirectTo="/admin" verified />);

    expect(screen.getByRole("heading", { name: "Email verified" })).toBeVisible();
  });
});
