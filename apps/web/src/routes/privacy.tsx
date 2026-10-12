import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslations } from "../i18n/client";
import { publicSeo } from "../lib/public-seo";
export const Route = createFileRoute("/privacy")({
  component: Privacy,
  head: ({ matches }) =>
    publicSeo("/privacy", matches, "cloudPrivacyTitle", "cloudPrivacyDescription"),
});
function Privacy() {
  const t = useTranslations("cloudMarketing");
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <Link to="/">{t("back")}</Link>
      <h1 className="mt-10 text-3xl font-semibold">{t("privacyTitle")}</h1>
      <p className="mt-6 leading-8 text-muted-foreground">{t("privacyBody")}</p>
    </main>
  );
}
