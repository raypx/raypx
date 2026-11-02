import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { safeReturnTo } from "../../features/auth/return-to";
import { Logo } from "@raypx/ui/logo";
import { useQuery } from "@tanstack/react-query";
import { publicConfigurationQuery } from "../../features/configuration/client";

export const Route = createFileRoute("/(auth)")({
  validateSearch: (search: Record<string, unknown>): { returnTo?: string } =>
    typeof search.returnTo === "string" ? { returnTo: safeReturnTo(search.returnTo) } : {},
  component: AuthLayout,
});

function AuthLayout() {
  const siteName = useQuery(publicConfigurationQuery()).data?.siteName ?? "Raypx";
  return (
    <div className="grid min-h-dvh lg:grid-cols-[2fr_3fr]">
      {/* Brand section - hidden on mobile, sidebar on desktop */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-muted to-muted/50 lg:flex lg:flex-col lg:justify-between lg:p-10">
        <Link to="/" aria-label={siteName} className="inline-flex min-w-0 max-w-full">
          <Logo label={siteName} className="max-w-full text-xl [&>span]:truncate" />
        </Link>
        <div className="space-y-2">
          <p className="text-lg font-medium">Your development workbench</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Project-centered workspace with device-local execution and optional remote access.
          </p>
        </div>
        {/* Decorative gradient orb */}
        <div
          className="pointer-events-none absolute -right-20 -top-20 size-96 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 blur-3xl"
          aria-hidden="true"
        />
      </aside>

      {/* Form section */}
      <div className="flex min-h-dvh flex-col">
        {/* Mobile header */}
        <header className="border-b border-border px-6 py-4 lg:hidden">
          <Link to="/" aria-label={siteName} className="inline-flex min-w-0 max-w-full">
            <Logo label={siteName} className="max-w-full [&>span]:truncate" />
          </Link>
        </header>
        <main id="main" tabIndex={-1} className="flex flex-1 items-center outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
