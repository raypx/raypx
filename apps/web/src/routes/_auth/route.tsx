import { AuthLayout } from "@raypx/auth";
import { Image } from "@raypx/ui/components/image";
import { createFileRoute, Link, Outlet, useLocation, useMatches } from "@tanstack/react-router";
import { authRoutes } from "~/config/auth";
import { getAuthPageFooter } from "./-components/auth-page-footer";
import { AuthPageConfigProvider, useAuthPageConfigValue } from "./-hooks/use-auth-page-config";

function AuthLayoutWrapper() {
  const config = useAuthPageConfigValue();
  const matches = useMatches();

  // Get meta from the current (last) route match
  const currentMatch = matches[matches.length - 1];
  const location = useLocation();
  const meta: { title?: string; description?: string } | undefined = currentMatch?.meta?.find(
    (m: { title?: string; description?: string } | undefined) => m?.title || m?.description,
  );

  const title = meta?.title;
  const description = meta?.description;
  const cardFooter = getAuthPageFooter(config.footerType);
  const isSignOut = location.pathname === authRoutes.signOut;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 p-4 md:p-10">
      <div className="w-full max-w-[400px] space-y-6">
        {/* Logo - Centered */}
        <div className="flex flex-col items-center text-center space-y-2">
          <Link className="mb-4 transition-transform hover:scale-105 active:scale-95" to="/">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Image
                alt="Raypx"
                className="object-cover"
                height={32}
                layout="fixed"
                priority
                shape="circle"
                src="/logo.png"
                width={32}
              />
            </div>
          </Link>
        </div>

        {/* Content */}
        {!isSignOut ? (
          <AuthLayout
            cardFooter={cardFooter}
            className="sm:border sm:shadow-sm sm:bg-card sm:rounded-xl sm:p-8"
            classNames={{
              header: "px-0 pt-0 text-center space-y-2",
              content: "px-0 py-4",
              title: "text-2xl font-bold tracking-tight text-foreground",
              description: "text-muted-foreground",
            }}
            description={description}
            title={title}
          >
            <Outlet />
          </AuthLayout>
        ) : (
          <Outlet />
        )}

        {/* Simple Footer Links */}
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <a className="hover:text-foreground transition-colors" href="/terms">
            Terms
          </a>
          <a className="hover:text-foreground transition-colors" href="/privacy">
            Privacy
          </a>
        </div>
      </div>
    </div>
  );
}

function AuthLayoutComponent() {
  return (
    <AuthPageConfigProvider>
      <AuthLayoutWrapper />
    </AuthPageConfigProvider>
  );
}

export const Route = createFileRoute("/_auth")({
  component: AuthLayoutComponent,
});
