import { useAuth } from "@raypx/auth";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OrgHeader } from "./-components/org-header";
import { OrgSidebar } from "./-components/org-sidebar";

export const Route = createFileRoute("/_org")({
  component: OrgLayout,
});

function OrgLayout() {
  const {
    hooks: { useSession },
  } = useAuth();
  const { data: session } = useSession();

  // Client-side redirect if not authenticated
  if (typeof window !== "undefined" && !session?.user) {
    window.location.href = `/sign-in?redirect=${encodeURIComponent(window.location.pathname)}`;
    return null;
  }

  // Show loading state while checking auth
  if (!session?.user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <OrgSidebar />
      <div className="flex-1 flex flex-col">
        <OrgHeader />
        <main className="flex-1 p-6 bg-muted/50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
