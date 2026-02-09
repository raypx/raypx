import { IconLoader } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "../hooks/use-auth";

/**
 * SignOutPage component that handles automatic sign-out
 *
 * This component automatically signs out the user when mounted and redirects
 * to the sign-in page after successful sign-out. It displays a loading state
 * during the sign-out process.
 *
 * @example
 * ```tsx
 * import { SignOutPage } from "@raypx/auth";
 *
 * export const Route = createFileRoute("/_auth/sign-out")({
 *   component: SignOutPage,
 * });
 * ```
 */
export function SignOutPage() {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const performSignOut = async () => {
      try {
        setError(null);

        // Sign out using better-auth
        const { error: signOutError } = await auth.signOut();

        if (signOutError) {
          setError(signOutError.message || "Failed to sign out");
          return;
        }

        // Navigate to sign-in page after successful sign-out
        navigate({
          to: "/sign-in",
          replace: true,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    };

    performSignOut();
  }, [auth, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-red-500">{error}</p>
          <button
            className="text-sm underline hover:no-underline"
            onClick={() => navigate({ to: "/sign-in", replace: true })}
            type="button"
          >
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <IconLoader className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Signing out...</p>
      </div>
    </div>
  );
}
