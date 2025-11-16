import { AuthLayout } from "@raypx/auth";
import { Image } from "@raypx/ui/components/image";
import { createFileRoute, Link, Outlet, useLocation, useMatches } from "@tanstack/react-router";
import { authRoutes } from "@/config/auth";
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
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="z-10 flex w-full max-w-sm flex-col gap-6">
        <Link className="flex items-center gap-2 self-center font-medium" to="/">
          <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full text-primary-foreground">
            <Image
              alt="Raypx"
              className="object-cover"
              height={24}
              layout="fixed"
              priority
              shape="circle"
              src="/logo.png"
              width={24}
            />
          </div>
          Raypx
        </Link>
        {!isSignOut ? (
          <AuthLayout cardFooter={cardFooter} description={description} title={title}>
            <Outlet />
          </AuthLayout>
        ) : (
          <Outlet />
        )}
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
