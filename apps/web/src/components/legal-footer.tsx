import { Link } from "@tanstack/react-router";
import { GithubIcon } from "@raypx/icons/github";
import { useTranslations } from "@raypx/i18n/browser";
import { cn } from "@raypx/ui/lib/utils";

const copyrightYear = new Date().getUTCFullYear();
const linkClass =
  "inline-flex min-h-8 items-center rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
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
        "text-sm text-muted-foreground",
        expanded && "flex flex-wrap items-center justify-between gap-4",
        className,
      )}
    >
      {expanded && (
        <span>
          © {copyrightYear} {siteName}
        </span>
      )}
      <nav
        aria-label={t("navigation")}
        className={expanded ? "flex flex-wrap items-center gap-5" : undefined}
      >
        <Link to="/privacy" className={linkClass}>
          {t("privacy")}
        </Link>
        {expanded && (
          <a
            href="https://github.com/raypx/raypx"
            target="_blank"
            rel="noreferrer"
            className={cn(linkClass, "gap-1.5")}
          >
            <GithubIcon aria-hidden="true" className="size-4 shrink-0" />
            GitHub
          </a>
        )}
      </nav>
    </footer>
  );
}
