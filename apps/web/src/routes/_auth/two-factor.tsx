import { useAuth, useOnSuccessTransition } from "@raypx/auth";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { AuthCard } from "~/layouts/auth/card";
import { TwoFactorVerify } from "~/layouts/auth/two-factor-verify";

const twoFactorSearch = z.object({
  redirectTo: z.string().optional(),
});

function TwoFactorPage() {
  const navigate = useNavigate();
  const { redirectTo } = useSearch({ from: "/_auth/two-factor" });
  const { redirectTo: defaultRedirectTo } = useAuth();
  const { onSuccess } = useOnSuccessTransition({
    redirectTo: redirectTo || defaultRedirectTo,
  });

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
            to="/signup"
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
  component: TwoFactorPage,
  validateSearch: twoFactorSearch,
  head: () => ({
    meta: [
      {
        title: "Two-Factor Authentication - Raypx",
        description: "Verify your identity with two-factor authentication",
      },
    ],
  }),
});
