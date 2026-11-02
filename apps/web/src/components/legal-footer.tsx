import { Link } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { cn } from "@raypx/ui/lib/utils";

export function LegalFooter({ className }: { className?: string }) {
  const t = useTranslations("legal");
  return (
    <footer className={cn("text-sm text-muted-foreground", className)}>
      <nav aria-label={t("navigation")}>
        <Link
          to="/privacy"
          className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("privacy")}
        </Link>
      </nav>
    </footer>
  );
}
