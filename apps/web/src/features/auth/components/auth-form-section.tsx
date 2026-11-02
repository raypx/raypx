import { Link } from "@tanstack/react-router";
import { Logo } from "@raypx/ui/logo";
import type { ReactNode } from "react";

interface AuthFormSectionProps {
  siteName: string;
  children: ReactNode;
}

export function AuthFormSection({ siteName, children }: AuthFormSectionProps) {
  return (
    <div className="flex min-h-dvh min-w-0 flex-col bg-background">
      <header className="px-6 py-6 lg:hidden">
        <Link
          to="/"
          aria-label={siteName}
          className="inline-flex min-w-0 max-w-full rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo label={siteName} className="max-w-full [&>span]:truncate" />
        </Link>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center outline-none lg:px-10"
      >
        {children}
      </main>
    </div>
  );
}
