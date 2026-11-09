import { Link } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { HelpHint } from "@raypx/ui/help-hint";
import { buttonVariants } from "@raypx/ui/components/ui/button";
import { cn } from "@raypx/ui/lib/utils";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { BookOpenIcon } from "@raypx/icons/book-open";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { FolderOpenIcon } from "@raypx/icons/folder-open";
import { GlobalIcon } from "@raypx/icons/global";
import { InboxIcon } from "@raypx/icons/inbox";
import { MonitorIcon } from "@raypx/icons/monitor";
import { ScheduleIcon } from "@raypx/icons/schedule";
import { TaskListIcon } from "@raypx/icons/task-list";
import { LandingAuthAction } from "./auth-action.tsx";
import { WorkflowPreview } from "./workflow-preview.tsx";

export function LandingHome() {
  const t = useTranslations("guest");
  const c = useTranslations("common");
  const memory = useTranslations("memory");
  const entries = [
    { to: "/projects", icon: FolderOpenIcon, title: c("projects") },
    { to: "/approvals", icon: InboxIcon, title: c("approvals") },
    { to: "/automations", icon: ScheduleIcon, title: c("jobs") },
    { to: "/memory", icon: BookOpenIcon, title: memory("title") },
  ] as const;
  return (
    <section
      aria-labelledby="landing-home-title"
      className="flex min-w-0 flex-col gap-8 @3xl/main:gap-10"
    >
      <div className="grid items-center gap-10 @3xl/main:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] @3xl/main:gap-14">
        <header className="flex min-w-0 flex-col items-start gap-8 py-2 @3xl/main:py-8">
          <h1
            id="landing-home-title"
            className="max-w-[14ch] text-[2.75rem] leading-[1.08] font-semibold tracking-tight text-balance @xl/main:text-6xl"
          >
            {t("title")}
          </h1>
          <div className="flex w-full flex-wrap items-center gap-3">
            <Link
              to="/projects"
              className={cn(
                buttonVariants({ size: "lg" }),
                "group max-w-full whitespace-normal motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.98] focus-visible:transition-none",
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
                "max-w-full whitespace-normal",
              )}
            >
              <TaskListIcon data-icon="inline-start" aria-hidden="true" />
              {c("tasks")}
            </Link>
            <HelpHint label={t("draftPrivacy")} description={t("tasksHint")} />
          </div>
        </header>
        <WorkflowPreview />
      </div>
      <section
        aria-labelledby="landing-computers-title"
        className="flex min-w-0 flex-wrap items-center justify-between gap-5 rounded-xl bg-muted/60 px-5 py-5 sm:px-6"
      >
        <h2 id="landing-computers-title" className="sr-only">
          {t("computers")}
        </h2>
        <div
          role="img"
          aria-label={t("connectionRoute")}
          className="flex items-center gap-3 text-sm"
        >
          <span aria-hidden="true" className="inline-flex items-center gap-2">
            <MonitorIcon className="size-5 text-muted-foreground" />
            Desktop
          </span>
          <span aria-hidden="true" className="flex items-center text-muted-foreground">
            <span className="h-px w-6 bg-border" />
            <ArrowRightIcon className="size-3.5" />
          </span>
          <span aria-hidden="true" className="inline-flex items-center gap-2">
            <GlobalIcon className="size-5 text-muted-foreground" />
            Web
          </span>
        </div>
        <LandingAuthAction className="max-w-full whitespace-normal text-left" />
      </section>
      <nav aria-label={c("workspace")} className="border-y border-border">
        <ul className="grid min-w-0 grid-cols-2 gap-x-5 @xl/main:grid-cols-4 @xl/main:gap-x-8">
          {entries.map(({ to, icon: Icon, title }) => (
            <li key={to} className="min-w-0">
              <Link
                to={to}
                className="group flex h-full min-h-20 items-center gap-3 rounded-sm py-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 text-sm leading-6 font-medium group-hover:underline group-hover:underline-offset-4">
                  {title}
                </span>
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:translate-x-0.5 group-focus-visible:transition-none"
                />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
