import { ArrowUpRightIcon } from "@raypx/icons/arrow-up-right";
import { buttonVariants } from "@raypx/ui/components/ui/button";
import { useTranslations } from "./i18n.js";

export function PageDocumentLink({ href, compact = false }: { href: string; compact?: boolean }) {
  const t = useTranslations("pages");
  const label = t("openInNewTab");
  return (
    <a
      className={buttonVariants(
        compact ? { variant: "ghost", size: "icon-sm" } : { variant: "outline", size: "sm" },
      )}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
    >
      {!compact && label}
      <ArrowUpRightIcon data-icon="inline-end" aria-hidden="true" />
    </a>
  );
}
