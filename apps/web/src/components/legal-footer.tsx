import { Link } from "@tanstack/react-router";
import { GithubIcon } from "@raypx/icons/github";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { useTranslations } from "@raypx/i18n/browser";
import { cn } from "@raypx/ui/lib/utils";
import markUrl from "@raypx/ui/logo-mark.webp";

const copyrightYear = new Date().getUTCFullYear();
const linkClass =
  "inline-flex min-h-8 items-center rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const landingLinkClass = "gap-1.5";
export function LegalFooter({
  className,
  expanded = false,
  siteName = "Raypx",
}: {
  className?: string;
  expanded?: boolean;
  siteName?: string;
}) {
  const t = useTranslations("legal");
  return (
    <footer
      className={cn(
        "text-xs text-muted-foreground",
        expanded &&
          "flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-8",
        className,
      )}
    >
      {expanded && (
        <p className="flex min-w-0 max-w-full items-center gap-2.5 text-xs">
          <img src={markUrl} alt="" width={20} height={20} className="size-5 shrink-0" />
          <span className="wrap-anywhere">
            © {copyrightYear} {siteName}
          </span>
        </p>
      )}
      <nav
        aria-label={t("navigation")}
        className={expanded ? "flex max-w-full flex-wrap items-center gap-x-5 gap-y-1" : undefined}
      >
        <Link to="/privacy" className={cn(linkClass, expanded && landingLinkClass)}>
          {expanded && <ShieldCheckIcon aria-hidden="true" className="size-4 shrink-0" />}
          {t("privacy")}
        </Link>
        {expanded && (
          <a
            href="https://github.com/raypx/raypx"
            target="_blank"
            rel="noreferrer"
            className={cn(linkClass, landingLinkClass)}
          >
            <GithubIcon aria-hidden="true" className="size-4 shrink-0" />
            GitHub
          </a>
        )}
      </nav>
    </footer>
  );
}
