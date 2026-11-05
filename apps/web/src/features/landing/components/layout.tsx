import { UserButton } from "../../../components/user-button";
import { Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@raypx/i18n/browser";
import { Logo } from "@raypx/ui/logo";
import { publicConfigurationQuery } from "../../configuration/client";
import { LanguageMenu, ThemeToggle } from "@raypx/blocks/preference-controls";
import { LegalFooter } from "../../../components/legal-footer";

export function LandingLayout() {
  const c = useTranslations("common");
  const siteName = useQuery(publicConfigurationQuery()).data?.siteName ?? "Raypx";
  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40rem] bg-[radial-gradient(ellipse_at_top,var(--color-muted),transparent_70%)]"
      />
      <a
        href="#main"
        className="sr-only rounded-md bg-background p-3 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        {c("skipNavigation")}
      </a>
      <header className="sticky top-0 z-20 border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-10">
          <Link
            to="/"
            aria-label={siteName}
            className="min-w-0 max-w-full rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo label={siteName} className="max-w-full [&>span]:truncate" />
          </Link>
          <nav
            aria-label={c("home")}
            className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2"
          >
            <div className="flex shrink-0 items-center gap-1">
              <ThemeToggle />
              <LanguageMenu />
              <UserButton sessionError="account" />
            </div>
          </nav>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="@container/main mx-auto w-full max-w-6xl flex-1 px-5 py-8 outline-none sm:px-10 sm:py-14"
      >
        <Outlet />
      </main>
      <div className="border-t border-border bg-muted/30">
        <LegalFooter
          expanded
          siteName={siteName}
          className="mx-auto w-full max-w-6xl px-5 py-4 sm:px-10"
        />
      </div>
    </div>
  );
}
