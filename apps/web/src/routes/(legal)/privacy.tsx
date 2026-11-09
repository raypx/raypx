import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";

export const Route = createFileRoute("/(legal)/privacy")({
  head: () => ({ meta: [{ title: "Privacy | Raypx" }] }),
  component: PrivacyPage,
});

const sections = [
  "local",
  "account",
  "remote",
  "storage",
  "diagnostics",
  "providers",
  "controls",
] as const;

function PrivacyPage() {
  const t = useTranslations("legal");
  return (
    <article className="flex flex-col gap-10 sm:gap-14">
      <header className="flex max-w-prose flex-col gap-4 border-b border-border pb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t("privacy")}
        </h1>
        <p className="text-base leading-7 text-muted-foreground">{t("intro")}</p>
        <p className="text-sm text-muted-foreground">{t("updated")}</p>
      </header>
      <div className="grid items-start gap-10 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-12">
        <nav
          aria-label={t("contents")}
          className="border-b border-border pb-6 md:sticky md:top-8 md:border-b-0 md:pb-0"
        >
          <h2 className="mb-3 text-sm font-medium">{t("contents")}</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 md:flex-col md:gap-1">
            {sections.map((section) => (
              <li key={section}>
                <Link
                  to="/privacy"
                  hash={section}
                  activeOptions={{ includeHash: true }}
                  className="inline-flex min-h-9 items-center rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                >
                  {t(`${section}.title`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 max-w-prose flex-col gap-10">
          {sections.map((section) => (
            <section
              key={section}
              id={section}
              aria-labelledby={`${section}-title`}
              tabIndex={-1}
              className="scroll-mt-8 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <h2
                id={`${section}-title`}
                className="mb-3 text-xl font-semibold tracking-tight text-balance"
              >
                {t(`${section}.title`)}
              </h2>
              <div className="flex flex-col gap-3 text-sm leading-7 text-pretty">
                <p>{t(`${section}.body`)}</p>
                <p>{t(`${section}.detail`)}</p>
                {section === "controls" && (
                  <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                    <Link
                      to="/settings"
                      className="rounded-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t("openSettings")}
                    </Link>
                    <Link
                      to="/projects"
                      hash="settings/account"
                      className="rounded-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t("openAccount")}
                    </Link>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
