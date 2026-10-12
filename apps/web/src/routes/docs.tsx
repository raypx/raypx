import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslations } from "../i18n/client";
import { publicSeo } from "../lib/public-seo";
export const Route = createFileRoute("/docs")({
  component: Documentation,
  head: ({ matches }) => publicSeo("/docs", matches, "cloudDocsTitle", "cloudDocsDescription"),
});
function Documentation() {
  const t = useTranslations("cloudMarketing");
  const c = useTranslations("cloud");
  const sections = [
    { title: c("search"), body: t("docsSearch") },
    { title: c("computer"), body: t("docsComputer") },
    { title: c("attachments"), body: t("docsFiles") },
    { title: c("revision"), body: t("docsReview") },
    { title: c("execution"), body: t("docsControl") },
    { title: c("usage"), body: t("docsUsage") },
  ];
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <Link to="/" className="text-sm underline">
        {t("back")}
      </Link>
      <h1 className="mt-10 text-3xl font-semibold tracking-tight">{t("docsTitle")}</h1>
      <p className="mt-4 text-muted-foreground leading-7">{t("docsIntro")}</p>
      <div className="mt-12 flex flex-col gap-10">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <p className="mt-3 leading-7 text-muted-foreground">{s.body}</p>
          </section>
        ))}
      </div>
      <p className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
        {t("docsPrivacy")}
      </p>
    </main>
  );
}
