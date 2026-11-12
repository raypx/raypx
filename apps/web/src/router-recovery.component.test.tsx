/** @vitest-environment happy-dom */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mocks, page, signIn } from "../tests/helpers/router-auth.js";

describe("authentication routes", () => {
  it("preserves the page through registration and password recovery links", async () => {
    const router = await page("/login?returnTo=%2Fapprovals");
    fireEvent.click(screen.getByRole("link", { name: "Create account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/signup"));
    expect(router.state.location.search).toMatchObject({ returnTo: "/approvals" });
    fireEvent.click(screen.getByRole("link", { name: "Sign in" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    fireEvent.click(screen.getByRole("link", { name: "Forgot password?" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/forgot-password"));
    expect(router.state.location.search).toMatchObject({ returnTo: "/approvals" });
  });

  it("preserves the destination in verification and reset emails", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: null });
    const router = await page("/signup?returnTo=%2Ftasks%3Ffrom%3Dguest");
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);
    await waitFor(() =>
      expect(mocks.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL:
            "https://raypx.example/verify-email?verified=1&returnTo=%2Ftasks%3Ffrom%3Dguest",
        }),
      ),
    );
    await router.navigate({ to: "/forgot-password", search: { returnTo: "/tasks?from=guest" } });
    mocks.requestPasswordReset.mockResolvedValue({ data: {}, error: null });
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send reset link" }).closest("form")!);
    await waitFor(() =>
      expect(mocks.requestPasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({
          redirectTo: "https://raypx.example/reset-password?returnTo=%2Ftasks%3Ffrom%3Dguest",
        }),
      ),
    );
  });

  it("submits the reset-link token and replacement password without an email field", async () => {
    mocks.resetPassword.mockResolvedValue({ data: {}, error: null });
    await page("/reset-password?token=reset-token");
    expect(screen.queryByLabelText("Email address")).toBeNull();
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "replacement-password" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Reset password" }).closest("form")!);
    await waitFor(() =>
      expect(mocks.resetPassword).toHaveBeenCalledWith({
        token: "reset-token",
        newPassword: "replacement-password",
        fetchOptions: { headers: { "Accept-Language": "en" } },
      }),
    );
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("preserves the email query when requesting a password reset", async () => {
    mocks.requestPasswordReset.mockResolvedValue({ data: {}, error: null });
    await page("/forgot-password?email=ada%2Bnewsletter%40example.test");
    expect(screen.getByLabelText("Email address")).toHaveValue("ada+newsletter@example.test");
    fireEvent.submit(screen.getByRole("button", { name: "Send reset link" }).closest("form")!);
    await waitFor(() =>
      expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
        email: "ada+newsletter@example.test",
        redirectTo: "https://raypx.example/reset-password",
        fetchOptions: { headers: { "Accept-Language": "en" }, onError: expect.any(Function) },
      }),
    );
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("keeps the login form available when a verification query is present", async () => {
    await page("/login?verified=1");
    expect(screen.getByLabelText("Email address")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("shows the verification result without a resend form for verified=1", async () => {
    await page("/verify-email?verified=1");
    expect(screen.getByText("Your email is verified. You can sign in now.")).toBeTruthy();
    expect(screen.queryByLabelText("Email address")).toBeNull();
    expect(screen.queryByRole("button", { name: "Resend verification email" })).toBeNull();
  });

  it("shows an invalid-link notice whenever the error query is present", async () => {
    await page("/verify-email?error");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This link is invalid or has expired. Request a new email.",
    );
    expect(screen.getByLabelText("Email address")).toBeTruthy();
  });
});

it("preserves password recovery for an existing account", async () => {
  signIn();
  const router = await page("/reset-password?token=valid");
  expect(router.state.location.pathname).toBe("/reset-password");
  expect(screen.getByLabelText("New password")).toBeTruthy();
});
