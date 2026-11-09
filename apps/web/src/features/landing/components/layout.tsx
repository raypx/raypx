import { UserButton } from "../../../components/user-button.tsx";
import { Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@raypx/i18n/browser";
import { publicConfigurationQuery } from "../../configuration/client.ts";
import { LanguageMenu, ThemeToggle } from "@raypx/blocks/preference-controls";
import { LegalFooter } from "../../../components/legal-footer.tsx";
import { PublicBackdrop, PublicHeader } from "../../../components/public-chrome.tsx";

export function LandingLayout() {
  const c = useTranslations("common");
  const siteName = useQuery(publicConfigurationQuery()).data?.siteName ?? "Raypx";
  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-background">
      <PublicBackdrop />
      <PublicHeader siteName={siteName} sticky>
        <nav aria-label={c("home")} className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <LanguageMenu />
          <UserButton sessionError="account" />
        </nav>
      </PublicHeader>
      <main
        id="main"
        tabIndex={-1}
        className="@container/main mx-auto w-full max-w-6xl flex-1 px-5 py-12 outline-none sm:px-8 sm:py-20"
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
