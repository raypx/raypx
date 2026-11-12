import { useTranslations } from "../../../i18n.js";
import { UserButton } from "../../../components/user-button.js";
import { Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { publicConfigurationQuery } from "../../configuration/client.js";
import { LanguageMenu, ThemeToggle } from "@raypx/blocks/preference-controls";
import { LegalFooter } from "../../../components/legal-footer.js";
import { PublicBackdrop, PublicHeader } from "../../../components/public-chrome.js";
import { cn } from "@raypx/ui/lib/utils";
import { brandAccentVars } from "../../../components/brand-accent.js";

export function LandingLayout() {
  const c = useTranslations("common");
  const siteName = useQuery(publicConfigurationQuery()).data?.siteName ?? "Raypx";
  return (
    <div
      className={cn(
        "relative isolate flex min-h-dvh flex-col overflow-x-clip bg-background",
        brandAccentVars,
      )}
    >
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
