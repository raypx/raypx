import { createProtectedRouteBeforeLoad, useAuth } from "@raypx/auth";
import { createFileRoute } from "@tanstack/react-router";
import { NotFound } from "~/components/not-found";
import { Layout } from "~/layouts/dashboard";

function AppLayout() {
  const {
    hooks: { useSession },
  } = useAuth();

  const { data: session } = useSession();

  // Session is guaranteed to exist due to beforeLoad check
  // But we still need it for the user data
  if (!session?.user) {
    return null; // This shouldn't happen due to beforeLoad, but handle gracefully
  }

  return <Layout user={session.user} />;
}

export const Route = createFileRoute("/dashboard")({
  beforeLoad: createProtectedRouteBeforeLoad("/sign-in"),
  component: AppLayout,
  notFoundComponent: NotFound,
});
