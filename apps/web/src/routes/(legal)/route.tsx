import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { IconButton } from "@raypx/ui/icon-button";
import { Logo } from "@raypx/ui/logo";
import { Separator } from "@raypx/ui/components/ui/separator";
import { ArrowLeft } from "lucide-react";
import { LegalFooter } from "../../components/legal-footer";
import { LanguageMenu } from "../../components/language-menu";
import { ThemeMenu } from "../../components/theme-menu";

export const Route = createFileRoute("/(legal)")({ component: LegalLayout });

function LegalLayout() {
  const t = useTranslations("legal");
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-5">
        <Link
          to="/"
          aria-label="Raypx"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo />
        </Link>
        <div className="flex items-center gap-3">
          <IconButton label={t("backHome")} render={<Link to="/" />} nativeButton={false}>
            <ArrowLeft aria-hidden="true" />
          </IconButton>
          <ThemeMenu />
          <LanguageMenu />
        </div>
      </header>
      <Separator />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 outline-none sm:py-16"
      >
        <Outlet />
      </main>
      <Separator />
      <LegalFooter className="mx-auto w-full max-w-5xl px-6 py-6" />
    </div>
  );
}
