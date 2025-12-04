import { useAuth } from "@raypx/auth";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

type AuthGuardProps = {
  redirectTo?: string;
  children: React.ReactNode;
};

/**
 * Guard component that redirects authenticated users away from auth pages
 * Use this component to wrap auth pages (sign-in, sign-up, etc.)
 */
export function AuthGuard({ redirectTo = "/dashboard", children }: AuthGuardProps) {
  const {
    hooks: { useSession },
  } = useAuth();
  const navigate = useNavigate();

  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && session?.user) {
      navigate({
        to: redirectTo,
        replace: true,
      });
    }
  }, [session, isPending, navigate, redirectTo]);

  // Show nothing while checking or if authenticated (will redirect)
  if (isPending || session?.user) {
    return null;
  }

  // User is not authenticated, show the auth page
  return <>{children}</>;
}
