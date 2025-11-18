import { RedirectToSignIn, useAuth } from "@raypx/auth";
import { createFileRoute } from "@tanstack/react-router";
import { NotFound } from "@/components/not-found";
import { Layout } from "@/layouts/dashboard";

export const Route = createFileRoute("/dashboard")({
  component: AppLayout,
  notFoundComponent: NotFound,
});

function AppLayout() {
  const {
    hooks: { useSession },
  } = useAuth();

  const { data: session, isPending } = useSession();

  // Show loading state while checking auth
  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to sign-in if not authenticated
  if (!session?.user) {
    return <RedirectToSignIn />;
  }

  return <Layout user={session.user} />;
}
