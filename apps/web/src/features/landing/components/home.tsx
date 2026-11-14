import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { AgentIcon } from "@raypx/icons/agent";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { GlobalIcon } from "@raypx/icons/global";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { MonitorIcon } from "@raypx/icons/monitor";
import { Badge } from "@raypx/ui/components/ui/badge";
import { buttonVariants } from "@raypx/ui/components/ui/button";
import { useTranslations } from "../../../i18n.js";
import { HeroArtwork } from "./hero-artwork.js";
import { WorkflowPreview } from "./workflow-preview.js";
import { CapabilityExample } from "./capability-example.js";
import { LandingAuthAction } from "./auth-action.js";

const capabilities = [
  "shared",
  "computers",
  "approvals",
  "routines",
  "knowledge",
  "tools",
] as const;

/** Public examples are static compositions, never mounted workspace clients. */
export function LandingHome() {
  const t = useTranslations("guest");
  const c = useTranslations("common");
  const frameRef = useRef<HTMLDivElement>(null);
  const steps = [
    { icon: ShieldCheckIcon, title: t("stepSpaceTitle"), hint: t("stepSpaceHint") },
    { icon: AgentIcon, title: t("stepAgentTitle"), hint: t("stepAgentHint") },
    { icon: GlobalIcon, title: t("stepConversationTitle"), hint: t("stepConversationHint") },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-20 @3xl/main:gap-28">
      <section
        aria-labelledby="landing-home-title"
        className="relative isolate flex min-w-0 flex-col items-center"
      >
        <header className="relative flex w-full min-w-0 flex-col items-center gap-5 pb-10 text-center @xl/main:pb-14">
          <HeroArtwork frameRef={frameRef} />
          <Badge variant="outline">Raypx</Badge>
          <h1
            id="landing-home-title"
            className="max-w-[19ch] text-[clamp(2.25rem,8.5cqw,2.75rem)] leading-tight font-semibold tracking-tighter text-balance @xl/main:text-6xl"
          >
            {t("title")}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-pretty text-muted-foreground @xl/main:text-lg">
            {t("heroSummary")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <LandingAuthAction size="lg" />
            <a href="#capabilities" className={buttonVariants({ variant: "ghost", size: "lg" })}>
              {t("explore")}
              <ArrowRightIcon data-icon="inline-end" />
            </a>
          </div>
        </header>
        <WorkflowPreview frameRef={frameRef} />
      </section>
      <section
        id="capabilities"
        aria-labelledby="landing-capabilities-title"
        className="flex min-w-0 scroll-mt-24 flex-col gap-8"
      >
        <header className="flex max-w-2xl flex-col gap-3">
          <h2
            id="landing-capabilities-title"
            className="text-3xl font-semibold tracking-tight text-balance @xl/main:text-4xl"
          >
            {t("capabilitiesTitle")}
          </h2>
          <p className="text-base leading-7 text-muted-foreground">{t("capabilitiesHint")}</p>
        </header>
        <div className="grid min-w-0 gap-6 @3xl/main:grid-cols-2">
          {capabilities.map((kind) => (
            <article
              key={kind}
              aria-labelledby={`landing-${kind}-title`}
              className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-background"
            >
              <div className="flex flex-1 flex-col gap-3 p-6 sm:p-7">
                <h3 id={`landing-${kind}-title`} className="text-xl font-semibold tracking-tight">
                  {t(`${kind}Title`)}
                </h3>
                <p className="text-sm leading-6 text-pretty text-muted-foreground">
                  {t(`${kind}Hint`)}
                </p>
              </div>
              <CapabilityExample kind={kind} />
            </article>
          ))}
        </div>
      </section>
      <section
        id="workflow"
        aria-labelledby="landing-how-title"
        className="flex min-w-0 scroll-mt-24 flex-col gap-8"
      >
        <h2 id="landing-how-title" className="text-3xl font-semibold tracking-tight text-balance">
          {t("howTitle")}
        </h2>
        <ol className="grid min-w-0 gap-8 @3xl/main:grid-cols-3">
          {steps.map(({ icon: Icon, title, hint }, index) => (
            <li key={title} className="flex min-w-0 flex-col gap-3 border-t border-border pt-5">
              <div className="flex items-center justify-between">
                <Icon aria-hidden="true" className="size-5" />
                <span className="text-xs text-muted-foreground tabular-nums">0{index + 1}</span>
              </div>
              <h3 className="text-base font-medium">{title}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{hint}</p>
            </li>
          ))}
        </ol>
      </section>
      <section
        id="clients"
        aria-labelledby="landing-clients-title"
        className="flex min-w-0 scroll-mt-24 flex-col gap-8"
      >
        <header className="flex max-w-2xl flex-col gap-3">
          <h2
            id="landing-clients-title"
            className="text-3xl font-semibold tracking-tight text-balance"
          >
            {t("clientsTitle")}
          </h2>
          <p className="text-base leading-7 text-muted-foreground">{t("clientsHint")}</p>
        </header>
        <div className="grid min-w-0 divide-y divide-border rounded-2xl border border-border @3xl/main:grid-cols-3 @3xl/main:divide-x @3xl/main:divide-y-0">
          {(["Web", "Desktop", "Mobile"] as const).map((client) => (
            <article key={client} className="flex min-w-0 flex-col gap-3 p-6">
              <MonitorIcon aria-hidden="true" className="size-5 text-muted-foreground" />
              <h3 className="text-lg font-medium">{t(`client${client}`)}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{t(`client${client}Hint`)}</p>
            </article>
          ))}
        </div>
      </section>
      <section
        aria-labelledby="landing-hosting-title"
        className="grid min-w-0 gap-6 rounded-2xl border border-border bg-muted/25 p-6 sm:p-8 @3xl/main:grid-cols-[1fr_2fr]"
      >
        <div className="flex flex-col items-start gap-4">
          <ShieldCheckIcon aria-hidden="true" className="size-5" />
          <h2
            id="landing-hosting-title"
            className="text-2xl font-semibold tracking-tight text-balance"
          >
            {t("hostingTitle")}
          </h2>
        </div>
        <div className="flex min-w-0 flex-col items-start gap-4">
          <p className="text-sm leading-6 text-muted-foreground">{t("hostingHint")}</p>
          <p className="text-sm leading-6 text-muted-foreground">{t("securityHint")}</p>
          <p className="text-sm leading-6 text-muted-foreground">{t("hostingSetupHint")}</p>
          <Link to="/privacy" className={buttonVariants({ variant: "link", className: "px-0" })}>
            {t("privacyLink")}
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </div>
      </section>
      <nav id="workspace" aria-label={c("workspace")} className="flex flex-wrap gap-3">
        <Link to="/agents" className={buttonVariants({ variant: "outline" })}>
          <AgentIcon data-icon="inline-start" />
          {t("openAgents")}
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
        <Link to="/settings" className={buttonVariants({ variant: "ghost" })}>
          {c("settings")}
        </Link>
      </nav>
    </div>
  );
}
