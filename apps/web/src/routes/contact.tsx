import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslations } from "../i18n/client";
import { env } from "../env";
import { publicSeo } from "../lib/public-seo";
export const Route = createFileRoute("/contact")({
  component: Contact,
  head: ({ matches }) =>
    publicSeo("/contact", matches, "cloudContactTitle", "cloudContactDescription"),
});
function Contact() {
  const t = useTranslations("cloudMarketing");
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <Link to="/">{t("back")}</Link>
      <h1 className="mt-10 text-3xl font-semibold">{t("contactTitle")}</h1>
      <p className="mt-6 leading-8 text-muted-foreground">{t("contactBody")}</p>
      {env.VITE_SUPPORT_EMAIL ? (
        <a className="mt-6 inline-block underline" href={`mailto:${env.VITE_SUPPORT_EMAIL}`}>
          {env.VITE_SUPPORT_EMAIL}
        </a>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">{t("contactUnavailable")}</p>
      )}
    </main>
  );
}
