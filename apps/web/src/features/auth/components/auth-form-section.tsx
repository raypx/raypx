import { Link } from "@tanstack/react-router";
import { Logo } from "@raypx/ui/logo";
import type { ReactNode } from "react";

interface AuthFormSectionProps {
  siteName: string;
  children: ReactNode;
}

export function AuthFormSection({ siteName, children }: AuthFormSectionProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Mobile header */}
      <header className="border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:hidden">
        <Link to="/" aria-label={siteName} className="inline-flex min-w-0 max-w-full">
          <Logo label={siteName} className="max-w-full [&>span]:truncate" />
        </Link>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center outline-none"
      >
        {children}
      </main>
    </div>
  );
}
