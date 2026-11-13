import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { AgentIcon } from "@raypx/icons/agent";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { GlobalIcon } from "@raypx/icons/global";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { Badge } from "@raypx/ui/components/ui/badge";
import { buttonVariants } from "@raypx/ui/components/ui/button";
import { cn } from "@raypx/ui/lib/utils";
import { useTranslations } from "../../../i18n.js";
import { HeroArtwork } from "./hero-artwork.js";
import { WorkflowPreview } from "./workflow-preview.js";
import { LandingAuthAction } from "./auth-action.js";

/** Public product introduction; example content never reads private workspace data. */
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
        <header className="relative flex w-full min-w-0 flex-col items-center gap-5 pb-12 text-center @xl/main:pb-16">
          <HeroArtwork frameRef={frameRef} />
          <Badge variant="outline">Raypx</Badge>
          <h1
            id="landing-home-title"
            className="max-w-[18ch] text-[clamp(2.25rem,8.5cqw,2.75rem)] leading-tight font-semibold tracking-tighter text-balance @xl/main:text-6xl"
          >
            {t("title")}
          </h1>
          <p className="max-w-xl text-base leading-7 text-pretty text-muted-foreground @xl/main:text-lg">
            {t("heroSummary")}
          </p>
          <LandingAuthAction size="lg" />
        </header>
        <WorkflowPreview frameRef={frameRef} />
      </section>
      <section
        id="workflow"
        aria-labelledby="landing-how-title"
        className="flex min-w-0 scroll-mt-24 flex-col gap-6"
      >
        <h2 id="landing-how-title" className="text-3xl font-semibold tracking-tight">
          {t("howTitle")}
        </h2>
        <ol className="grid min-w-0 divide-y divide-border rounded-2xl border border-border @3xl/main:grid-cols-3 @3xl/main:divide-x @3xl/main:divide-y-0">
          {steps.map(({ icon: Icon, title, hint }) => (
            <li key={title} className="flex min-w-0 flex-col gap-3 p-6">
              <Icon aria-hidden="true" className="size-5" />
              <h3 className="text-base font-medium">{title}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{hint}</p>
            </li>
          ))}
        </ol>
      </section>
      <nav id="workspace" aria-label={c("workspace")} className="flex flex-wrap gap-3">
        <Link to="/agents" className={cn(buttonVariants({ variant: "outline" }))}>
          <AgentIcon data-icon="inline-start" />
          {t("openAgents")}
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
        <Link to="/settings" className={cn(buttonVariants({ variant: "ghost" }))}>
          {c("settings")}
        </Link>
      </nav>
      <section
        id="computers"
        aria-labelledby="landing-next-title"
        className="flex min-w-0 scroll-mt-24 flex-col gap-3 rounded-2xl border border-border bg-muted/25 p-6"
      >
        <h2 id="landing-next-title" className="text-2xl font-semibold">
          {t("nextTitle")}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{t("nextHint")}</p>
      </section>
    </div>
  );
}
