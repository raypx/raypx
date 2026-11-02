import { Link } from "@tanstack/react-router";
import { Logo } from "@raypx/ui/logo";
import { LanguageMenu } from "../../../components/language-menu";
import { ThemeMenu } from "../../../components/theme-menu";
import type { ReactNode } from "react";
import { LegalFooter } from "../../../components/legal-footer";

interface AuthFormSectionProps {
  siteName: string;
  children: ReactNode;
}

export function AuthFormSection({ siteName, children }: AuthFormSectionProps) {
  return (
    <div className="flex min-h-dvh min-w-0 flex-col bg-background">
      <header className="flex min-w-0 items-center justify-end gap-4 px-6 py-6 lg:px-10">
        <Link
          to="/"
          aria-label={siteName}
          className="mr-auto inline-flex min-w-0 max-w-full rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <Logo label={siteName} className="max-w-full [&>span]:truncate" />
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeMenu />
          <LanguageMenu />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center outline-none lg:px-10"
      >
        {children}
      </main>
      <LegalFooter className="px-6 py-6 text-center" />
    </div>
  );
}
