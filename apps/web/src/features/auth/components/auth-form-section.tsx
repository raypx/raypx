import { Link } from "@tanstack/react-router";
import { Logo } from "@raypx/ui/logo";
import { LanguageMenu, ThemeToggle } from "@raypx/blocks/preference-controls";
import type { ReactNode } from "react";
import { LegalFooter } from "../../../components/legal-footer.tsx";
import { AuthBrandSection } from "./auth-brand-section.tsx";
import { useTranslations } from "@raypx/i18n/browser";

interface AuthFormSectionProps {
  siteName: string;
  children: ReactNode;
}

export function AuthFormSection({ siteName, children }: AuthFormSectionProps) {
  const c = useTranslations("common");
  return (
    <div className="relative isolate flex min-h-dvh min-w-0 flex-col bg-background">
      <a
        href="#main"
        className="sr-only rounded-md bg-background p-3 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        {c("skipNavigation")}
      </a>
      <header className="mx-auto flex min-h-20 w-full max-w-6xl min-w-0 items-center gap-4 px-5 py-4 sm:px-8">
        <Link
          to="/"
          aria-label={siteName}
          className="mr-auto inline-flex min-w-0 max-w-full rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo label={siteName} className="max-w-full [&>span]:truncate" />
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <LanguageMenu />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex w-full min-w-0 flex-1 items-center justify-center px-4 py-6 outline-none sm:px-8 sm:py-10"
      >
        <div className="grid w-full max-w-[29rem] overflow-hidden rounded-[16px] border border-border bg-background lg:max-w-[60rem] lg:grid-cols-[5fr_4fr]">
          <div className="flex min-w-0 items-center justify-center p-6 sm:p-8 lg:p-10">
            {children}
          </div>
          <AuthBrandSection />
        </div>
      </main>
      <LegalFooter className="mx-auto w-full max-w-6xl px-5 py-5 text-center text-xs sm:px-8" />
    </div>
  );
}
