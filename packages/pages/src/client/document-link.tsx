import { ArrowUpRightIcon } from "@raypx/icons/arrow-up-right";
import { buttonVariants } from "@raypx/ui/components/ui/button";
import { useTranslations } from "./i18n.js";

export function PageDocumentLink({ href }: { href: string }) {
  const t = useTranslations("pages");
  return (
    <a
      className={buttonVariants({ variant: "outline", size: "sm" })}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {t("openInNewTab")}
      <ArrowUpRightIcon data-icon="inline-end" aria-hidden="true" />
    </a>
  );
}
