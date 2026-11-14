import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { buttonVariants } from "@raypx/ui/components/ui/button";
import { useTranslations } from "../../../i18n.js";

export function BootstrapOnboarding() {
  const t = useTranslations("site");
  return (
    <Alert>
      <AlertDescription className="flex flex-col items-start gap-3">
        <h2 className="font-medium">{t("setupTitle")}</h2>
        <p>{t("setupHint")}</p>
        <Link to="/agents" className={buttonVariants({ variant: "outline" })}>
          {t("setupSkip")}
        </Link>
      </AlertDescription>
    </Alert>
  );
}
