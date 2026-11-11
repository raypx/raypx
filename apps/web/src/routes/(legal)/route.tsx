import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@raypx/i18n/browser";
import { IconButton } from "@raypx/ui/icon-button";
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";
import { LegalFooter } from "../../components/legal-footer.js";
import { PublicBackdrop, PublicHeader } from "../../components/public-chrome.js";
import { publicConfigurationQuery } from "../../features/configuration/client.js";
import { LanguageMenu, ThemeToggle } from "@raypx/blocks/preference-controls";

export const Route = createFileRoute("/(legal)")({ component: LegalLayout });

function LegalLayout() {
  const t = useTranslations("legal");
  const siteName = useQuery(publicConfigurationQuery()).data?.siteName ?? "Raypx";
  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-background text-foreground">
      <PublicBackdrop className="h-[32rem]" />
      <PublicHeader siteName={siteName} sticky>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label={t("backHome")} render={<Link to="/" />} nativeButton={false}>
            <ArrowLeftIcon aria-hidden="true" />
          </IconButton>
          <ThemeToggle />
          <LanguageMenu />
        </div>
      </PublicHeader>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 outline-none sm:px-8 sm:py-16"
      >
        <Outlet />
      </main>
      <div className="border-t border-border">
        <LegalFooter
          expanded
          siteName={siteName}
          className="mx-auto w-full max-w-6xl px-5 py-5 sm:px-8"
        />
      </div>
    </div>
  );
}
