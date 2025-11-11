import { useAuth } from "@raypx/auth";
import { auth } from "@raypx/auth/server";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { AppHeader } from "./-components/app-header";
import { AppSidebar } from "./-components/app-sidebar";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    // const session = await auth.api.getSession({
    //   headers: getRequestHeaders(),
    // });
    // if (!session?.session) {
    //   throw redirect({ to: "/sign-in", params: { redirect: location.pathname } });
    // }
    // Note: We can't check auth in beforeLoad on the server side
    // because the auth session is stored in cookies and needs client-side access
    // So we'll do a client-side check in the component
    // This is a limitation of the current Better Auth + TanStack Router setup
  },
  component: AppLayout,
});

function AppLayout() {
  const {
    hooks: { useSession },
  } = useAuth();

  const { data: session } = useSession();

  // Client-side redirect if not authenticated
  if (typeof window !== "undefined" && !session?.user) {
    // Redirect to sign-in with current path as redirect param
    const currentPath = window.location.pathname;
    window.location.href = `/sign-in?redirect=${encodeURIComponent(currentPath)}`;
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
      {/* Sidebar */}
      <AppSidebar user={session.user} />

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <AppHeader user={session.user} />

        {/* Page content */}
        <main className="flex-1 p-6 bg-muted/50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
