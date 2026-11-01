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
    <div className="min-h-dvh">
      <header className="mx-auto w-full max-w-sm px-6 pt-10">
        <Link to="/" aria-label={siteName} className="inline-flex min-w-0 max-w-full">
          <Logo label={siteName} className="max-w-full [&>span]:truncate" />
        </Link>
      </header>
      <main id="main" tabIndex={-1} className="outline-none">
        <Outlet />
      </main>
    </div>
  );
}
