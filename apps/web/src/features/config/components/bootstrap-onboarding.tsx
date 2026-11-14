import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@raypx/ui/components/ui/button";
import { PageHeader } from "@raypx/ui/page-header";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { useTranslations } from "../../../i18n.js";

export function BootstrapOnboarding() {
  const t = useTranslations("site");
  return (
    <PageHeader
      title={t("setupTitle")}
      description={t("setupHint")}
      action={
        <Link to="/agents" className={buttonVariants({ variant: "outline" })}>
          {t("setupSkip")}
          <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
        </Link>
      }
    />
  );
}
