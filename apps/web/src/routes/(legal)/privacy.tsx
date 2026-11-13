import { useTranslations } from "../../i18n.js";
import { createFileRoute, Link } from "@tanstack/react-router";

import { ClockIcon } from "@raypx/icons/clock";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { cn } from "@raypx/ui/lib/utils";

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
      <header className="flex max-w-prose flex-col items-start gap-5 border-b border-border pb-10">
        <span className="grid size-12 place-items-center rounded-xl border border-border bg-background shadow-soft">
          <ShieldCheckIcon aria-hidden="true" className="size-6" />
        </span>
        <h1 className="bg-linear-to-b from-foreground to-foreground/65 bg-clip-text pb-1 text-4xl font-semibold tracking-tight text-balance text-transparent sm:text-5xl">
          {t("privacy")}
        </h1>
        <p className="text-base leading-7 text-pretty text-muted-foreground sm:text-lg sm:leading-8">
          {t("intro")}
        </p>
        <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
          <ClockIcon aria-hidden="true" className="size-3.5" />
          {t("updated")}
        </p>
      </header>
      <div className="grid items-start gap-10 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-12">
        <nav
          aria-label={t("contents")}
          className="border-b border-border pb-6 md:sticky md:top-24 md:border-b-0 md:pb-0"
        >
          <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("contents")}
          </h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 md:flex-col md:gap-0 md:border-l md:border-border">
            {sections.map((section, index) => (
              <li key={section}>
                <Link
                  to="/privacy"
                  hash={section}
                  activeOptions={{ includeHash: true }}
                  className="group/toc inline-flex min-h-9 items-center gap-2.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:font-medium aria-[current=page]:text-foreground md:-ml-px md:border-l md:border-transparent md:pl-4 md:hover:border-foreground/30 md:aria-[current=page]:border-foreground motion-safe:transition-[color,border-color] motion-safe:duration-150"
                >
                  <span
                    aria-hidden="true"
                    className="font-mono text-xs text-muted-foreground/70 tabular-nums motion-safe:transition-transform motion-safe:duration-150 group-hover/toc:translate-x-0.5"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {t(`${section}.title`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 max-w-prose flex-col gap-10">
          {sections.map((section, index) => (
            <section
              key={section}
              id={section}
              aria-labelledby={`${section}-title`}
              tabIndex={-1}
              className={cn(
                "scroll-mt-24 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring target:motion-safe:animate-in target:motion-safe:fade-in-50 target:motion-safe:duration-500",
                index > 0 && "border-t border-border pt-10",
              )}
            >
              <span
                aria-hidden="true"
                className="mb-2 block font-mono text-xs text-muted-foreground tabular-nums"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
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
                      to="/agents"
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
