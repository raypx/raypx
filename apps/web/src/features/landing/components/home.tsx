import { useId, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import type { IconComponent } from "@raypx/icons";
import { HelpHint } from "@raypx/ui/help-hint";
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
import { DotGrid, SpotlightLayer, useSpotlight } from "../../../components/artwork.tsx";
import { LandingAuthAction } from "./auth-action.tsx";
import { ApprovalsArt, AutomationsArt, MemoryArt, ProjectsArt } from "./illustrations.tsx";
import { WorkflowPreview } from "./workflow-preview.tsx";

type WorkspacePath = "/projects" | "/approvals" | "/automations" | "/memory";

const sectionTitle = "text-2xl font-semibold tracking-tight text-balance @xl/main:text-3xl";

/**
 * Public homepage. Content is visible on first paint; only artwork reacts to hover and
 * the example's tabs animate their own state. Nothing here reads account or device data.
 */
export function LandingHome() {
  return (
    <div className="flex min-w-0 flex-col gap-24 @3xl/main:gap-32">
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
  return (
    <section
      aria-labelledby="landing-home-title"
      className="flex min-w-0 flex-col items-center gap-14 @3xl/main:gap-16"
    >
      <header className="flex max-w-3xl min-w-0 flex-col items-center gap-6 text-center">
        <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur-sm">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-foreground" />
          <span className="truncate">{auth("brandTitle")}</span>
        </p>
        <h1
          id="landing-home-title"
          className="max-w-[16ch] bg-linear-to-b from-foreground to-foreground/65 bg-clip-text pb-1 text-[2.75rem] leading-[1.06] font-semibold tracking-tight text-balance text-transparent forced-colors:bg-none forced-colors:text-[CanvasText] @xl/main:text-6xl @4xl/main:text-7xl"
        >
          {t("title")}
        </h1>
        <p className="max-w-xl text-base leading-7 text-pretty text-muted-foreground @xl/main:text-lg @xl/main:leading-8">
          {auth("brandIntro")}
        </p>
        <div className="mt-2 flex w-full flex-wrap items-center justify-center gap-3">
          <Link
            to="/projects"
            className={cn(
              buttonVariants({ size: "lg" }),
              "group max-w-full whitespace-normal shadow-soft motion-safe:transition-[background-color,box-shadow,scale] motion-safe:duration-150 motion-safe:hover:shadow-popover motion-safe:active:scale-[0.97] focus-visible:transition-none",
            )}
          >
            <FolderOpenIcon data-icon="inline-start" aria-hidden="true" />
            {t("openProjects")}
            <ArrowRightIcon
              data-icon="inline-end"
              aria-hidden="true"
              className="motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:translate-x-0.5 group-focus-visible:transition-none"
            />
          </Link>
          <Link
            to="/tasks"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "max-w-full whitespace-normal motion-safe:transition-[background-color,scale] motion-safe:duration-150 motion-safe:active:scale-[0.97] focus-visible:transition-none",
            )}
          >
            <TaskListIcon data-icon="inline-start" aria-hidden="true" />
            {c("tasks")}
          </Link>
          <HelpHint label={t("draftPrivacy")} description={t("tasksHint")} />
        </div>
      </header>
      <div className="relative mx-auto w-full max-w-5xl min-w-0">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-12 bottom-1/3 -z-10 bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--foreground)_9%,transparent),transparent)] blur-2xl"
        />
        <div className="rounded-[1.375rem] border border-border bg-muted/50 p-1.5 shadow-soft backdrop-blur-sm">
          <WorkflowPreview className="rounded-[1rem]" />
        </div>
      </div>
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
    <section aria-labelledby="landing-how-title" className="flex min-w-0 flex-col gap-10">
      <h2 id="landing-how-title" className={sectionTitle}>
        {t("howTitle")}
      </h2>
      <ol className="grid min-w-0 gap-x-10 gap-y-6 @3xl/main:grid-cols-3 @3xl/main:gap-y-10">
        {steps.map(({ icon: Icon, title, hint }, index) => (
          <li
            key={title}
            className="relative flex min-w-0 gap-4 border-t border-border pt-6 @3xl/main:flex-col @3xl/main:gap-5"
          >
            <span aria-hidden="true" className="absolute -top-px left-0 h-px w-12 bg-foreground" />
            <span className="flex shrink-0 items-center justify-between gap-3 self-start @3xl/main:self-stretch">
              <span className="grid size-11 place-items-center rounded-xl border border-border bg-card shadow-soft">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span
                aria-hidden="true"
                className="hidden text-xs font-medium text-muted-foreground tabular-nums @3xl/main:inline"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
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
      wide: true,
    },
    {
      to: "/approvals",
      icon: InboxIcon,
      title: c("approvals"),
      hint: t("entryApprovals"),
      art: <ApprovalsArt />,
      wide: false,
    },
    {
      to: "/automations",
      icon: ScheduleIcon,
      title: c("jobs"),
      hint: t("entryAutomations"),
      art: <AutomationsArt />,
      wide: false,
    },
    {
      to: "/memory",
      icon: BookOpenIcon,
      title: memory("title"),
      hint: t("entryMemory"),
      art: <MemoryArt />,
      wide: true,
    },
  ] as const;
  return (
    <nav aria-labelledby="landing-workspace-title" className="flex min-w-0 flex-col gap-10">
      <h2 id="landing-workspace-title" className={sectionTitle}>
        {c("workspace")}
      </h2>
      <ul className="grid min-w-0 gap-4 @xl/main:grid-cols-2 @4xl/main:grid-cols-3">
        {entries.map(({ wide, ...entry }) => (
          <li key={entry.to} className={cn("flex min-w-0", wide && "@4xl/main:col-span-2")}>
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
      className="group relative isolate flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground outline-none hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150"
    >
      {art}
      <span className="flex items-center gap-4 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-muted/60 motion-safe:transition-[scale] motion-safe:duration-300 motion-safe:group-hover:scale-105">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={`${id}-title`} className="text-sm font-medium">
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
      <SpotlightLayer />
    </Link>
  );
}

function ComputersBand() {
  const t = useTranslations("guest");
  const spotlight = useSpotlight<HTMLElement>();
  return (
    <section
      aria-labelledby="landing-computers-title"
      onPointerMove={spotlight}
      className="group relative isolate overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-soft"
    >
      <DotGrid className="mask-[radial-gradient(ellipse_60%_90%_at_75%_50%,#000_10%,transparent_80%)]" />
      <SpotlightLayer />
      <div className="relative grid items-center gap-10 p-6 @xl/main:p-8 @4xl/main:grid-cols-2 @4xl/main:gap-16 @4xl/main:p-12">
        <div className="flex min-w-0 flex-col items-start gap-6">
          <div className="flex flex-col gap-3">
            <h2 id="landing-computers-title" className={sectionTitle}>
              {t("computers")}
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
      className="flex w-full max-w-md min-w-0 items-center gap-3 justify-self-center"
    >
      <DiagramNode icon={LaptopIcon} label="Desktop" />
      <span aria-hidden="true" className="relative flex min-w-10 flex-1 items-center">
        <span className="h-0 w-full border-t border-dashed border-foreground/30 group-hover:border-foreground/50 motion-safe:transition-colors motion-safe:duration-300" />
        <span className="absolute left-1/2 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-soft group-hover:text-foreground motion-safe:transition-[color,scale] motion-safe:duration-300 motion-safe:group-hover:scale-110">
          <ShieldCheckIcon className="size-4" />
        </span>
      </span>
      <DiagramNode icon={GlobalIcon} label="Web" />
    </div>
  );
}

function DiagramNode({ icon: Icon, label }: { icon: IconComponent; label: string }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 flex-col items-center gap-2">
      <span className="grid size-14 place-items-center rounded-2xl border border-border bg-background shadow-soft motion-safe:transition-[translate] motion-safe:duration-300 motion-safe:group-hover:-translate-y-0.5">
        <Icon className="size-6" />
      </span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </span>
  );
}
