import { RedirectToSignIn, useAuth } from "@raypx/auth";
import { Button } from "@raypx/ui/components/button";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";
import { links } from "@/config/site";
import { AppHeader } from "./-components/header";
import { AppSidebar } from "./-components/sidebar";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    console.log("beforeLoad");
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

  const { data: session, isPending } = useSession();

  // Client-side redirect if not authenticated
  // if (typeof window !== "undefined" && !session?.user) {
  //   // Redirect to sign-in with current path as redirect param
  //   const currentPath = window.location.pathname;
  //   window.location.href = `/sign-in?redirect=${encodeURIComponent(currentPath)}`;
  //   return null;
  // }

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

        {/* Footer */}
        <footer className="border-t bg-background px-6 py-4">
          <div className="flex items-center justify-between">
            <Button asChild className="gap-2" size="sm" variant="ghost">
              <a href={links.docs} rel="noopener noreferrer" target="_blank">
                <HelpCircle className="h-4 w-4" />
                <span>Help & Support</span>
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Raypx</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
