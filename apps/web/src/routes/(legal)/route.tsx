import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { IconButton } from "@raypx/ui/icon-button";
import { Logo } from "@raypx/ui/logo";
import { Separator } from "@raypx/ui/components/ui/separator";
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";
import { LegalFooter } from "../../components/legal-footer.tsx";
import { LanguageMenu, ThemeToggle } from "@raypx/blocks/preference-controls";

export const Route = createFileRoute("/(legal)")({ component: LegalLayout });

function LegalLayout() {
  const t = useTranslations("legal");
  const c = useTranslations("common");
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#main"
        className="sr-only rounded-md bg-background p-3 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        {c("skipNavigation")}
      </a>
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Link
          to="/"
          aria-label="Raypx"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo />
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label={t("backHome")} render={<Link to="/" />} nativeButton={false}>
            <ArrowLeftIcon aria-hidden="true" />
          </IconButton>
          <ThemeToggle />
          <LanguageMenu />
        </div>
      </header>
      <Separator />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 outline-none sm:px-8 sm:py-14"
      >
        <Outlet />
      </main>
      <Separator />
      <LegalFooter className="mx-auto w-full max-w-5xl px-5 py-5 sm:px-8" />
    </div>
  );
}
