import { LanguageMenu, ThemeToggle } from "@raypx/blocks/preference-controls";
import { cn } from "@raypx/ui/lib/utils";
import type { ReactNode } from "react";
import { enterOnLoad } from "../../../components/artwork.tsx";
import { LegalFooter } from "../../../components/legal-footer.tsx";
import { PublicBackdrop, PublicHeader } from "../../../components/public-chrome.tsx";
import { AuthBrandSection } from "./auth-brand-section.tsx";

interface AuthFormSectionProps {
  siteName: string;
  children: ReactNode;
}

export function AuthFormSection({ siteName, children }: AuthFormSectionProps) {
  return (
    <div className="relative isolate flex min-h-dvh min-w-0 flex-col bg-background">
      <PublicBackdrop />
      <PublicHeader siteName={siteName}>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <LanguageMenu />
        </div>
      </PublicHeader>
      <main
        id="main"
        tabIndex={-1}
        className="flex w-full min-w-0 flex-1 items-center justify-center px-4 py-6 outline-none sm:px-8 sm:py-10"
      >
        <div
          className={cn(
            "grid w-full max-w-[29rem] overflow-hidden rounded-[16px] border border-border bg-background shadow-soft lg:max-w-[60rem] lg:grid-cols-[5fr_4fr]",
            enterOnLoad,
          )}
        >
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
