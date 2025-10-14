import { Button } from "@raypx/ui/components/button";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Logo } from "./logo";

export default function NotFound() {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8">
      <Logo className="size-12" />

      <h1 className="text-4xl font-bold">{t("title")}</h1>

      <p className="text-balance text-center text-xl font-medium px-4">{t("message")}</p>

      <Button asChild className="cursor-pointer" size="lg" variant="default">
        <Link to="/">{t("backToHome")}</Link>
      </Button>
    </div>
  );
}
