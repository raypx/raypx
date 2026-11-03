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
import markUrl from "@raypx/ui/logo-mark.webp";
import type { IconComponent } from "@raypx/icons";
import { AgentIcon } from "@raypx/icons/agent";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { FileEditIcon } from "@raypx/icons/file-edit";
import { InboxIcon } from "@raypx/icons/inbox";
import { DevicesIcon } from "@raypx/icons/devices";
import { PaletteIcon } from "@raypx/icons/palette";
import { LaptopIcon } from "@raypx/icons/laptop";
import { LoginIcon } from "@raypx/icons/login";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";

export function LandingHome() {
  const t = useTranslations("guest");
  const entries = [
    { key: "approvals", to: "/approvals", icon: InboxIcon },
    { key: "preferences", to: "/settings", icon: PaletteIcon },
  ] as const;
  return (
    <section
      aria-labelledby="landing-home-title"
      className="grid gap-4 @3xl/main:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] @3xl/main:gap-5"
    >
      <div className="contents">
        <header className="relative isolate flex min-w-0 flex-col items-start gap-8 overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-xs @xl/main:p-10 @3xl/main:min-h-96 motion-safe:animate-in motion-safe:fill-mode-backwards motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700">
          <HeroArtwork />
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 py-1 pr-3 pl-2.5 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur-sm">
            <FileEditIcon aria-hidden="true" className="size-3.5" />
            {t("draft")}
          </span>
          <div className="flex max-w-lg flex-col gap-4">
            <h1
              id="landing-home-title"
              className="max-w-[15ch] bg-linear-to-br from-foreground from-40% to-foreground/55 bg-clip-text pb-1 text-4xl leading-[1.1] font-semibold tracking-tight text-balance text-transparent @xl/main:text-5xl"
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
                "group min-h-11 max-w-full whitespace-normal shadow-sm motion-safe:transition-[transform,box-shadow] motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md motion-safe:active:translate-y-0",
              )}
            >
              <FileEditIcon data-icon="inline-start" aria-hidden="true" />
              {t("writeDraft")}
              <ArrowRightIcon
                data-icon="inline-end"
                aria-hidden="true"
                className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-x-1 motion-safe:group-focus-visible:translate-x-1"
              />
            </Link>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
              {t("draftHint")}
            </span>
          </div>
        </header>
        <Empty className="relative isolate overflow-hidden rounded-3xl border border-solid border-border bg-card p-6 shadow-xs @xl/main:p-8 @3xl/main:col-start-2 @3xl/main:row-span-2 @3xl/main:row-start-1 motion-safe:animate-in motion-safe:fill-mode-backwards motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700 motion-safe:delay-100">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] bg-size-[1rem_1rem] mask-radial-from-10% mask-radial-to-70%"
          />
          <EmptyHeader>
            <EmptyMedia aria-hidden="true" className="my-5 flex w-full max-w-72 items-center">
              <DiagramNode icon={DevicesIcon} />
              <DiagramLink />
              <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md ring-4 ring-muted">
                <ShieldCheckIcon className="size-6" />
              </span>
              <DiagramLink />
              <DiagramNode icon={LaptopIcon} />
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
                "h-auto min-h-11 max-w-full whitespace-normal bg-background text-center motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0",
              )}
            >
              <LoginIcon data-icon="inline-start" aria-hidden="true" />
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
              className="group flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-xs outline-none hover:border-foreground/15 focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[transform,box-shadow,border-color] motion-safe:duration-200 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-md motion-safe:focus-visible:-translate-y-1 motion-safe:active:translate-y-0"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-muted text-muted-foreground group-hover:border-transparent group-hover:bg-primary group-hover:text-primary-foreground group-focus-visible:border-transparent group-focus-visible:bg-primary group-focus-visible:text-primary-foreground motion-safe:transition-colors motion-safe:duration-200">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t(key)}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                  {t(`${key}Hint`)}
                </span>
              </span>
              <ChevronRightIcon
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

/** Decorative hero backdrop: a fading grid, the brand-mark glow and an orbit around the mark. */
function HeroArtwork() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-size-[2rem_2rem] mask-radial-at-top-right mask-radial-from-0% mask-radial-to-75%" />
      <img
        alt=""
        src={markUrl}
        width={96}
        height={96}
        className="absolute -top-20 -right-20 size-80 opacity-40 blur-3xl"
      />
      <div className="absolute -top-28 -right-28 hidden size-[26rem] @xl/main:block">
        <span className="absolute inset-0 rounded-full border border-dashed border-foreground/10" />
        <span className="absolute inset-12 rounded-full border border-foreground/10" />
        <span className="absolute inset-24 rounded-full border border-foreground/10 bg-muted/50" />
        <img
          alt=""
          src={markUrl}
          width={96}
          height={96}
          className="absolute inset-0 m-auto size-16 drop-shadow-lg"
        />
        <OrbitNode icon={InboxIcon} className="top-[calc(50%+5rem)] left-[calc(50%-8.75rem)]" />
        <OrbitNode icon={AgentIcon} className="top-[calc(50%+11.25rem)] left-[calc(50%-6.5rem)]" />
      </div>
    </div>
  );
}

function OrbitNode({ icon: Icon, className }: { icon: IconComponent; className: string }) {
  return (
    <span
      className={cn(
        "absolute grid size-9 -translate-1/2 place-items-center rounded-xl border border-border bg-background text-muted-foreground shadow-sm",
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

function DiagramNode({ icon: Icon }: { icon: IconComponent }) {
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-border bg-background text-muted-foreground shadow-sm">
      <Icon className="size-5" />
    </span>
  );
}

function DiagramLink() {
  return <span className="h-0 min-w-4 flex-1 border-t-2 border-dashed border-border" />;
}
