import { useTranslations } from "../../../i18n.js";
import { useId, useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import type { IconComponent } from "@raypx/icons";
import { HelpHint } from "@raypx/ui/help-hint";
import { Badge } from "@raypx/ui/components/ui/badge";
import { buttonVariants } from "@raypx/ui/components/ui/button";
import { cn } from "@raypx/ui/lib/utils";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { BookOpenIcon } from "@raypx/icons/book-open";
import { FolderOpenIcon } from "@raypx/icons/folder-open";
import { GlobalIcon } from "@raypx/icons/global";
import { InboxIcon } from "@raypx/icons/inbox";
import { LaptopIcon } from "@raypx/icons/laptop";
import { ScheduleIcon } from "@raypx/icons/schedule";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { TaskListIcon } from "@raypx/icons/task-list";
import { DotGrid, SpotlightLayer, useSpotlight } from "../../../components/artwork.js";
import { LandingAuthAction } from "./auth-action.js";
import { ApprovalsArt, AutomationsArt, MemoryArt, ProjectsArt } from "./illustrations.js";
import { WorkflowPreview } from "./workflow-preview.js";
import { accentGradient } from "../../../components/brand-accent.js";
import { FlowPackets } from "./flow-packets.js";
import { HeroArtwork } from "./hero-artwork.js";

type WorkspacePath = "/projects" | "/approvals" | "/automations" | "/memory";

const sectionTitle = "text-3xl font-semibold tracking-tight text-balance @3xl/main:text-4xl";

/**
 * Public homepage. The hero and workspace examples use the public copy and sample data.
 */
export function LandingHome() {
  return (
    <div className="flex min-w-0 flex-col gap-20 @3xl/main:gap-28">
      <Hero />
      <HowItWorks />
      <WorkspaceLinks />
      <ComputersBand />
    </div>
  );
}

function Hero() {
  const t = useTranslations("guest");
  const c = useTranslations("common");
  const auth = useTranslations("auth");
  const frameRef = useRef<HTMLDivElement>(null);
  return (
    <section
      aria-labelledby="landing-home-title"
      className="relative isolate flex min-w-0 flex-col items-center"
    >
      <header className="relative flex w-full min-w-0 flex-col items-center gap-5 pb-12 text-center @xl/main:gap-6 @xl/main:pb-16">
        <HeroArtwork frameRef={frameRef} />
        <Badge
          variant="outline"
          className="h-auto max-w-full gap-2 bg-background/80 py-1 pr-3 pl-1 shadow-soft"
        >
          <span
            aria-hidden="true"
            className={cn("grid size-4 shrink-0 place-items-center rounded-full", accentGradient)}
          >
            <span className="size-1.5 rounded-full bg-background" />
          </span>
          <span className="truncate">{auth("brandTitle")}</span>
        </Badge>
        <h1
          id="landing-home-title"
          className="max-w-[16ch] text-[2.75rem] leading-[1.06] font-semibold tracking-tighter text-balance @xl/main:text-6xl @4xl/main:text-7xl"
        >
          {t("title")}
        </h1>
        <p className="max-w-xl text-base leading-7 text-pretty text-muted-foreground @xl/main:text-lg @xl/main:leading-8">
          {auth("brandIntro")}
        </p>
        <div className="flex w-full flex-wrap items-center justify-center gap-2.5">
          <Link
            to="/projects"
            className={cn(
              buttonVariants({ size: "lg" }),
              "group max-w-full whitespace-normal shadow-soft",
            )}
          >
            <FolderOpenIcon data-icon="inline-start" aria-hidden="true" />
            {t("openProjects")}
            <ArrowRightIcon
              data-icon="inline-end"
              aria-hidden="true"
              className="motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:translate-x-0.5"
            />
          </Link>
          <Link
            to="/tasks"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "max-w-full whitespace-normal bg-background",
            )}
          >
            <TaskListIcon data-icon="inline-start" aria-hidden="true" />
            {c("tasks")}
          </Link>
          <HelpHint label={t("draftPrivacy")} description={t("tasksHint")} />
        </div>
      </header>
      <WorkflowPreview frameRef={frameRef} />
    </section>
  );
}

function HowItWorks() {
  const t = useTranslations("guest");
  const auth = useTranslations("auth");
  const steps = [
    { icon: LaptopIcon, title: auth("featureLocal"), hint: t("stepLocalHint") },
    { icon: ShieldCheckIcon, title: auth("featureApprovals"), hint: t("stepReviewHint") },
    { icon: GlobalIcon, title: auth("featureRemote"), hint: t("stepRemoteHint") },
  ];
  return (
    <section
      id="workflow"
      aria-labelledby="landing-how-title"
      className="flex min-w-0 scroll-mt-24 flex-col gap-6 @3xl/main:gap-8"
    >
      <h2 id="landing-how-title" className={sectionTitle}>
        {t("howTitle")}
      </h2>
      <ol className="grid min-w-0 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-muted/25 @3xl/main:grid-cols-3 @3xl/main:divide-x @3xl/main:divide-y-0">
        {steps.map(({ icon: Icon, title, hint }) => (
          <li
            key={title}
            className="flex min-w-0 gap-4 p-5 @3xl/main:flex-col @3xl/main:gap-5 @3xl/main:p-7"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-background shadow-soft">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <span className="flex min-w-0 flex-col gap-1.5 @3xl/main:gap-2">
              <h3 className="text-base font-medium tracking-tight text-balance @3xl/main:text-lg">
                {title}
              </h3>
              <p className="text-sm leading-6 text-pretty text-muted-foreground">{hint}</p>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function WorkspaceLinks() {
  const t = useTranslations("guest");
  const c = useTranslations("common");
  const memory = useTranslations("memory");
  const entries = [
    {
      to: "/projects",
      icon: FolderOpenIcon,
      title: c("projects"),
      hint: t("entryProjects"),
      art: <ProjectsArt />,
    },
    {
      to: "/approvals",
      icon: InboxIcon,
      title: c("approvals"),
      hint: t("entryApprovals"),
      art: <ApprovalsArt />,
    },
    {
      to: "/automations",
      icon: ScheduleIcon,
      title: c("jobs"),
      hint: t("entryAutomations"),
      art: <AutomationsArt />,
    },
    {
      to: "/memory",
      icon: BookOpenIcon,
      title: memory("title"),
      hint: t("entryMemory"),
      art: <MemoryArt />,
    },
  ] as const;
  return (
    <nav
      id="workspace"
      aria-labelledby="landing-workspace-title"
      className="flex min-w-0 scroll-mt-24 flex-col gap-6 @3xl/main:gap-8"
    >
      <h2 id="landing-workspace-title" className={sectionTitle}>
        {c("workspace")}
      </h2>
      <ul className="grid min-w-0 gap-4 @xl/main:grid-cols-2">
        {entries.map((entry) => (
          <li key={entry.to} className="flex min-w-0">
            <WorkspaceEntry {...entry} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function WorkspaceEntry({
  to,
  icon: Icon,
  title,
  hint,
  art,
}: {
  to: WorkspacePath;
  icon: IconComponent;
  title: string;
  hint: string;
  art: ReactNode;
}) {
  const id = useId();
  const spotlight = useSpotlight<HTMLAnchorElement>();
  return (
    <Link
      to={to}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`}
      onPointerMove={spotlight}
      className="group relative isolate flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground outline-none hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150"
    >
      <span className="flex flex-1 items-center gap-4 p-5 @3xl/main:p-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-muted/60 motion-safe:transition-[scale] motion-safe:duration-300 motion-safe:group-hover:scale-105">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={`${id}-title`} className="text-base font-semibold tracking-tight">
            {title}
          </span>
          <span id={`${id}-hint`} className="text-sm leading-6 text-pretty text-muted-foreground">
            {hint}
          </span>
        </span>
        <ArrowRightIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground motion-safe:transition-[color,translate] motion-safe:duration-150 motion-safe:group-hover:translate-x-0.5"
        />
      </span>
      {art}
      <SpotlightLayer />
    </Link>
  );
}

function ComputersBand() {
  const common = useTranslations("common");
  const t = useTranslations("guest");
  const spotlight = useSpotlight<HTMLElement>();
  return (
    <section
      id="computers"
      aria-labelledby="landing-computers-title"
      onPointerMove={spotlight}
      className="group relative isolate scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-muted/25 text-card-foreground"
    >
      <DotGrid className="mask-[radial-gradient(ellipse_60%_90%_at_75%_50%,#000_10%,transparent_80%)]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -bottom-24 -z-10 h-72 w-2/3 rounded-full bg-[var(--brand-violet)] opacity-[0.12] blur-[80px] dark:opacity-[0.2]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-1/4 -z-10 h-56 w-1/2 rounded-full bg-[var(--brand-sky)] opacity-[0.1] blur-[80px] dark:opacity-[0.18]"
      />
      <SpotlightLayer />
      <div className="relative grid items-center gap-8 p-6 @xl/main:p-8 @3xl/main:grid-cols-2 @3xl/main:gap-12 @4xl/main:p-12">
        <div className="flex min-w-0 flex-col items-start gap-6">
          <div className="flex flex-col gap-3">
            <h2 id="landing-computers-title" className={sectionTitle}>
              {common("connectedComputers")}
            </h2>
            <p className="max-w-md text-sm leading-6 text-pretty text-muted-foreground @xl/main:text-base @xl/main:leading-7">
              {t("computersSummary")}
            </p>
          </div>
          <LandingAuthAction
            size="lg"
            className="max-w-full whitespace-normal text-left shadow-soft"
          />
        </div>
        <ConnectionDiagram label={t("connectionRoute")} />
      </div>
    </section>
  );
}

/** Explains the boundary only: it never implies an observed connection or reads device state. */
function ConnectionDiagram({ label }: { label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="flex w-full max-w-md min-w-0 items-center gap-3 justify-self-center rounded-xl border border-border bg-background/65 p-4 shadow-soft @xl/main:gap-4 @xl/main:p-6"
    >
      <DiagramNode icon={LaptopIcon} label="Desktop" />
      <span aria-hidden="true" className="relative flex min-w-10 flex-1 items-center">
        <span
          className={cn(
            "h-px w-full opacity-60 [mask-image:repeating-linear-gradient(90deg,#000_0_6px,transparent_6px_10px)] group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-300",
            accentGradient,
          )}
        />
        <FlowPackets />
        <span
          className={cn(
            "absolute left-1/2 grid size-10 -translate-x-1/2 place-items-center rounded-full p-px shadow-soft motion-safe:transition-[scale] motion-safe:duration-300 motion-safe:group-hover:scale-110",
            accentGradient,
          )}
        >
          <span className="grid size-full place-items-center rounded-full bg-background text-foreground">
            <ShieldCheckIcon className="size-4" />
          </span>
        </span>
      </span>
      <DiagramNode icon={GlobalIcon} label="Web" />
    </div>
  );
}

function DiagramNode({ icon: Icon, label }: { icon: IconComponent; label: string }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 flex-col items-center gap-2">
      <span className="grid size-12 place-items-center rounded-xl border border-border bg-card shadow-soft motion-safe:transition-[translate] motion-safe:duration-300 motion-safe:group-hover:-translate-y-0.5 @xl/main:size-14">
        <Icon className="size-6" />
      </span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </span>
  );
}
