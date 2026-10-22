import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Logo } from "@raypx/ui/logo";
import { useQuery } from "@tanstack/react-query";
import { publicConfigurationQuery } from "../../features/configuration/client";

export const Route = createFileRoute("/(auth)")({ component: AuthLayout });

function AuthLayout() {
  const siteName = useQuery(publicConfigurationQuery()).data?.siteName ?? "Raypx";
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="shrink-0 px-10 pt-8 max-[760px]:px-6">
        <Link to="/" aria-label={siteName} className="inline-flex min-w-0 max-w-full">
          <Logo label={siteName} className="max-w-full [&>span]:truncate" />
        </Link>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
    </div>
  );
}
