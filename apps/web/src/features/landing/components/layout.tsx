import { Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@raypx/i18n/browser";
import { Logo } from "@raypx/ui/logo";
import { buttonVariants } from "@raypx/ui/components/ui/button";
import { publicConfigurationQuery } from "../../configuration/client";

export function LandingLayout() {
  const c = useTranslations("common");
  const siteName = useQuery(publicConfigurationQuery()).data?.siteName ?? "Raypx";
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a
        href="#main"
        className="sr-only rounded-md bg-background p-3 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        {c("skipNavigation")}
      </a>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-10">
          <Link
            to="/"
            aria-label={siteName}
            className="min-w-0 max-w-full rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo label={siteName} className="max-w-full [&>span]:truncate" />
          </Link>
          <nav aria-label={c("home")} className="flex flex-wrap items-center gap-2">
            <Link to="/projects" className={buttonVariants({ variant: "ghost" })}>
              {c("projects")}
            </Link>
            <Link to="/login" className={buttonVariants()}>
              {c("signIn")}
            </Link>
          </nav>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="@container/main mx-auto w-full max-w-6xl flex-1 px-6 py-10 outline-none sm:px-10 sm:py-16"
      >
        <Outlet />
      </main>
    </div>
  );
}
