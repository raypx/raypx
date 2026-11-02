import { Link } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { buttonVariants } from "@raypx/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@raypx/ui/components/ui/empty";
import { cn } from "@raypx/ui/lib/utils";
import {
  ArrowRight,
  ChevronRight,
  FilePenLine,
  Inbox,
  MonitorSmartphone,
  Palette,
  Laptop,
  ShieldCheck,
} from "lucide-react";

export function LandingHome() {
  const t = useTranslations("guest");
  const entries = [
    { key: "approvals", to: "/approvals", icon: Inbox },
    { key: "preferences", to: "/settings", icon: Palette },
  ] as const;
  return (
    <section
      aria-labelledby="landing-home-title"
      className="grid gap-4 @3xl/main:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] @3xl/main:gap-5"
    >
      <div className="contents">
        <header className="relative isolate flex min-w-0 flex-col items-start gap-8 overflow-hidden rounded-3xl border border-border bg-muted/30 p-6 @xl/main:p-10 @3xl/main:min-h-96 motion-safe:animate-in motion-safe:fill-mode-backwards motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-24 -z-10 size-80 rounded-full border border-border/60 bg-linear-to-br from-muted/80 to-transparent"
          />
          <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <FilePenLine aria-hidden="true" className="size-4" />
            {t("draft")}
          </span>
          <div className="flex max-w-lg flex-col gap-4">
            <h1
              id="landing-home-title"
              className="max-w-[15ch] text-4xl leading-[1.1] font-semibold tracking-tight text-balance @xl/main:text-5xl"
            >
              {t("title")}
            </h1>
            <p className="text-base leading-relaxed text-pretty text-muted-foreground">
              {t("intro")}
            </p>
          </div>
          <div className="mt-auto flex w-full flex-wrap items-center gap-4">
            <Link
              to="/tasks"
              className={cn(
                buttonVariants({ size: "lg" }),
                "group min-h-11 max-w-full whitespace-normal motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0",
              )}
            >
              <FilePenLine data-icon="inline-start" aria-hidden="true" />
              {t("writeDraft")}
              <ArrowRight
                data-icon="inline-end"
                aria-hidden="true"
                className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-1 motion-safe:group-focus-visible:translate-x-1"
              />
            </Link>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
              {t("draftHint")}
            </span>
          </div>
        </header>
        <Empty className="relative isolate overflow-hidden rounded-3xl border border-solid border-border bg-card p-6 @xl/main:p-8 @3xl/main:col-start-2 @3xl/main:row-span-2 @3xl/main:row-start-1 motion-safe:animate-in motion-safe:fill-mode-backwards motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700 motion-safe:delay-100">
          <EmptyHeader>
            <EmptyMedia className="relative my-5 h-28 w-40">
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full border border-dashed border-border"
              />
              <span
                aria-hidden="true"
                className="absolute inset-3 rounded-full border border-border/60"
              />
              <span className="relative grid size-16 place-items-center rounded-2xl border border-border bg-background shadow-sm">
                <MonitorSmartphone aria-hidden="true" className="size-8 text-muted-foreground" />
              </span>
              <span
                aria-hidden="true"
                className="absolute right-2 bottom-0 grid size-9 place-items-center rounded-xl border border-border bg-background shadow-sm"
              >
                <Laptop className="size-4 text-muted-foreground" />
              </span>
            </EmptyMedia>
            <EmptyTitle>
              <h2>{t("computers")}</h2>
            </EmptyTitle>
            <EmptyDescription>{t("computersHint")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              to="/login"
              search={{ returnTo: "/settings" }}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-auto min-h-11 max-w-full whitespace-normal text-center motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0",
              )}
            >
              {t("connect")}
            </Link>
          </EmptyContent>
        </Empty>
      </div>
      <ul className="grid min-w-0 gap-4 @xl/main:grid-cols-2 @3xl/main:col-start-1 @3xl/main:gap-5">
        {entries.map(({ key, to, icon: Icon }) => (
          <li
            key={key}
            className={cn(
              "min-w-0 motion-safe:animate-in motion-safe:fill-mode-backwards motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700",
              key === "approvals" ? "motion-safe:delay-150" : "motion-safe:delay-200",
            )}
          >
            <Link
              to={to}
              className="group flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-5 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[transform,box-shadow,background-color] motion-safe:duration-200 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-sm motion-safe:focus-visible:-translate-y-1 motion-safe:active:translate-y-0"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t(key)}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                  {t(`${key}Hint`)}
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="mt-3 size-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-0.5 motion-safe:group-focus-visible:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
