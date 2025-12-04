import { useAuth, useOnSuccessTransition } from "@raypx/auth";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { AuthCard } from "~/layouts/auth/card";
import { TwoFactorVerify } from "~/layouts/auth/two-factor-verify";

const twoFactorSearch = z.object({
  redirectTo: z.string().optional(),
});

function TwoFactorPage() {
  const navigate = useNavigate();
  const { redirectTo } = useSearch({ from: "/_auth/two-factor" });
  const { auth, redirectTo: defaultRedirectTo } = useAuth();
  const { onSuccess } = useOnSuccessTransition({
    redirectTo: redirectTo || defaultRedirectTo,
  });

  useEffect(() => {
    // Check if user is already authenticated (shouldn't be here if they are)
    async function checkSession() {
      try {
        const { data: session } = await auth.getSession();
        if (session?.user && !session.user.twoFactorEnabled) {
          // User is authenticated but doesn't have 2FA enabled, redirect
          await onSuccess();
          navigate({ to: redirectTo || defaultRedirectTo || "/dashboard" });
        }
      } catch {
        // Session check failed, continue
      }
    }
    checkSession();
  }, [auth, navigate, redirectTo, defaultRedirectTo, onSuccess]);

  async function handleSuccess() {
    await onSuccess();
    await navigate({
      to: redirectTo || defaultRedirectTo || "/dashboard",
      replace: true,
    });
  }

  return (
    <AuthCard
      description="Enter the code from your authenticator app to complete sign in"
      footer={
        <>
          Don't have an account?{" "}
          <Link
            className="font-medium underline underline-offset-4 hover:text-primary"
            to="/sign-up"
          >
            Sign Up
          </Link>
        </>
      }
      title="Two-Factor Authentication"
    >
      <TwoFactorVerify onSuccess={handleSuccess} />
    </AuthCard>
  );
}

export const Route = createFileRoute("/_auth/two-factor")({
  beforeLoad: async ({ location }) => {
    const { auth } = await import("@raypx/auth");
    const { redirect } = await import("@tanstack/react-router");

    try {
      const { data: session } = await auth.getSession();

      // If user is already fully authenticated (has complete session), redirect to dashboard
      if (session?.user) {
        throw redirect({
          to: "/dashboard",
          search: location.search,
          replace: true,
        });
      }

      // If no session exists, allow access (user might have temporary 2FA challenge from first login step)
      // The actual security is enforced by the backend:
      // - better-auth creates a temporary 2FA challenge after first step login
      // - If user directly accesses /two-factor without completing first step,
      //   auth.twoFactor.verify() will fail with an error
      // - The component will handle the error and redirect to sign-in
    } catch (error) {
      // Re-throw redirect errors
      if (error && typeof error === "object" && "to" in error) {
        throw error;
      }
      // Allow access even if session check fails
      // Backend verification will catch unauthorized access attempts
    }
  },
  validateSearch: twoFactorSearch,
  head: () => ({
    meta: [
      {
        title: "Two-Factor Authentication - Raypx",
        description: "Verify your identity with two-factor authentication",
      },
    ],
  }),
  component: TwoFactorPage,
});
