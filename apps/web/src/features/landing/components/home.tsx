import { Link } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { buttonVariants } from "@raypx/ui/components/ui/button";
import { cn } from "@raypx/ui/lib/utils";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { BookOpenIcon } from "@raypx/icons/book-open";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { FolderOpenIcon } from "@raypx/icons/folder-open";
import { InboxIcon } from "@raypx/icons/inbox";
import { MonitorIcon } from "@raypx/icons/monitor";
import { ScheduleIcon } from "@raypx/icons/schedule";
import { TaskListIcon } from "@raypx/icons/task-list";
import { authClient } from "../../auth/client.ts";
import { LandingAuthAction } from "./auth-action.tsx";

export function LandingHome() {
  const t = useTranslations("guest");
  const c = useTranslations("common");
  const memory = useTranslations("memory");
  const session = authClient.useSession();
  const signedIn = !session.isPending && !session.error && Boolean(session.data);
  const entries = [
    {
      to: "/projects",
      icon: FolderOpenIcon,
      title: c("projects"),
      hint: t(signedIn ? "projectsHintSignedIn" : "projectsHint"),
    },
    {
      to: "/approvals",
      icon: InboxIcon,
      title: c("approvals"),
      hint: t(signedIn ? "approvalsHintSignedIn" : "approvalsHint"),
    },
    {
      to: "/automations",
      icon: ScheduleIcon,
      title: c("jobs"),
      hint: t(signedIn ? "jobsHintSignedIn" : "jobsHint"),
    },
    {
      to: "/memory",
      icon: BookOpenIcon,
      title: memory("title"),
      hint: t(signedIn ? "memoryHintSignedIn" : "memoryHint"),
    },
  ] as const;
  return (
    <section
      aria-labelledby="landing-home-title"
      className="flex min-w-0 flex-col gap-12 @3xl/main:gap-16"
    >
      <div className="grid items-end gap-10 @3xl/main:grid-cols-[minmax(0,1.7fr)_minmax(16rem,1fr)] @3xl/main:gap-16">
        <header className="flex min-w-0 flex-col items-start gap-6 py-4 @xl/main:py-8">
          <h1
            id="landing-home-title"
            className="max-w-[19ch] text-3xl leading-tight font-semibold tracking-tight text-balance @xl/main:text-4xl"
          >
            {t("title")}
          </h1>
          <p className="max-w-lg text-base leading-7 text-pretty text-muted-foreground">
            {t(signedIn ? "introSignedIn" : "intro")}
          </p>
          <div className="flex w-full flex-wrap items-center gap-3 pt-2">
            <Link
              to="/projects"
              className={cn(buttonVariants({ size: "lg" }), "group max-w-full whitespace-normal")}
            >
              <FolderOpenIcon data-icon="inline-start" aria-hidden="true" />
              {c("projects")}
              <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
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
          </div>
          <p className="max-w-lg text-sm leading-6 text-muted-foreground">{t("tasksHint")}</p>
        </header>
        <section
          aria-labelledby="landing-computers-title"
          className="flex min-w-0 flex-col gap-5 rounded-xl border border-border bg-sidebar p-6"
        >
          <MonitorIcon aria-hidden="true" className="size-6 text-muted-foreground" />
          <div className="flex flex-col gap-2">
            <h2 id="landing-computers-title" className="text-lg font-medium">
              {t("computers")}
            </h2>
            <p className="text-sm leading-6 text-pretty text-muted-foreground">
              {t(
                session.isPending
                  ? "computersSummary"
                  : session.data
                    ? "computersHintSignedIn"
                    : "computersHint",
              )}
            </p>
          </div>
          <LandingAuthAction className="max-w-full self-start whitespace-normal text-left" />
        </section>
      </div>
      <nav aria-label={c("workspace")} className="border-t border-border">
        <ul className="grid min-w-0 @3xl/main:grid-cols-2 @3xl/main:gap-x-10">
          {entries.map(({ to, icon: Icon, title, hint }) => (
            <li key={to} className="min-w-0 border-b border-border">
              <Link
                to={to}
                className="group flex h-full items-center gap-4 rounded-sm py-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium group-hover:underline group-hover:underline-offset-4">
                    {title}
                  </span>
                  <span className="text-sm leading-6 text-pretty text-muted-foreground">
                    {hint}
                  </span>
                </span>
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
