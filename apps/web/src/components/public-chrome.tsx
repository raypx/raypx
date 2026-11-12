import { useTranslations } from "../i18n.js";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { Logo } from "@raypx/ui/logo";
import { cn } from "@raypx/ui/lib/utils";

function useScrolled(enabled: boolean) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [enabled]);
  return scrolled;
}

/**
 * Skip link, original logo and caller-owned actions for landing, authentication and
 * legal pages. Sticky headers gain a surface only after the page scrolls; the 1px
 * border is always reserved so the header height never changes.
 */
export function PublicHeader({
  siteName,
  sticky = false,
  children,
}: {
  siteName: string;
  sticky?: boolean;
  children: ReactNode;
}) {
  const c = useTranslations("common");
  const scrolled = useScrolled(sticky);
  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-md bg-background p-3 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        {c("skipNavigation")}
      </a>
      <header
        data-scrolled={scrolled ? "" : undefined}
        className={cn(
          "z-20 border-b border-transparent",
          sticky &&
            "sticky top-0 data-scrolled:border-border/70 data-scrolled:bg-background/75 data-scrolled:backdrop-blur-md motion-safe:transition-[background-color,border-color] motion-safe:duration-300",
        )}
      >
        <div className="mx-auto flex min-h-16 w-full max-w-6xl min-w-0 flex-wrap items-center gap-3 px-5 py-3 sm:px-8">
          <Link
            to="/"
            aria-label={siteName}
            className="mr-auto inline-flex min-w-0 max-w-full rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo
              label={siteName}
              className="max-w-full [&>img]:motion-safe:transition-transform [&>img]:motion-safe:duration-500 hover:[&>img]:motion-safe:rotate-[24deg] [&>span]:truncate"
            />
          </Link>
          {children}
        </div>
      </header>
    </>
  );
}

/** Masked dot grid with a soft top light (dark theme only); the parent is `relative isolate`. */
export function PublicBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem] overflow-hidden",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(color-mix(in_oklch,var(--foreground)_16%,transparent)_1px,transparent_1px)] bg-size-[24px_24px] mask-[radial-gradient(ellipse_70%_60%_at_50%_0%,#000_20%,transparent_100%)] dark:bg-[radial-gradient(color-mix(in_oklch,var(--foreground)_12%,transparent)_1px,transparent_1px)]" />
      <div className="absolute inset-0 hidden bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,color-mix(in_oklch,var(--foreground)_7%,transparent),transparent)] dark:block" />
    </div>
  );
}
