import { Link } from "@tanstack/react-router";
import { AgentIcon } from "@raypx/icons/agent";
import { CheckIcon } from "@raypx/icons/check";
import { CodeFolderIcon } from "@raypx/icons/code-folder";
import { MonitorIcon } from "@raypx/icons/monitor";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { TerminalIcon } from "@raypx/icons/terminal";
import type { IconComponent } from "@raypx/icons";
import { Logo } from "@raypx/ui/logo";
import markUrl from "@raypx/ui/logo-mark.webp";
import { cn } from "@raypx/ui/lib/utils";
import { useTranslations } from "@raypx/i18n/browser";

interface AuthBrandSectionProps {
  siteName: string;
}

export function AuthBrandSection({ siteName }: AuthBrandSectionProps) {
  const t = useTranslations("auth");

  return (
    <aside className="sticky top-0 hidden h-dvh p-3 lg:flex">
      <div className="relative isolate flex w-full flex-col gap-10 overflow-hidden rounded-3xl border border-border bg-muted/40 p-10 xl:p-14">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-size-[2rem_2rem] mask-radial-at-top mask-radial-from-0% mask-radial-to-80%" />
          <img
            alt=""
            src={markUrl}
            width={96}
            height={96}
            className="absolute top-[38%] left-1/2 size-96 -translate-1/2 opacity-30 blur-3xl"
          />
        </div>
        <Link
          to="/"
          aria-label={siteName}
          className="inline-flex max-w-full self-start rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo label={siteName} className="max-w-full [&>span]:truncate" />
        </Link>
        <div className="grid min-h-0 flex-1 place-items-center motion-safe:animate-in motion-safe:fill-mode-backwards motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-700">
          <ProductPreview />
        </div>
        <div className="flex flex-col gap-8">
          <div className="flex max-w-md flex-col gap-3">
            <h2 className="bg-linear-to-br from-foreground from-40% to-foreground/55 bg-clip-text pb-1 text-3xl leading-tight font-semibold tracking-tight text-transparent xl:text-4xl">
              {t("brandTitle")}
            </h2>
            <p className="text-sm leading-7 text-muted-foreground">{t("brandIntro")}</p>
          </div>
          <ul className="flex flex-col gap-3">
            <FeatureItem icon={MonitorIcon} text={t("featureLocal")} />
            <FeatureItem icon={CodeFolderIcon} text={t("featureRemote")} />
            <FeatureItem icon={ShieldCheckIcon} text={t("featureApprovals")} />
          </ul>
        </div>
      </div>
    </aside>
  );
}

function FeatureItem({ icon: Icon, text }: { icon: IconComponent; text: string }) {
  return (
    <li className="flex items-center gap-3 text-sm text-foreground/80">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background text-muted-foreground shadow-xs">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      {text}
    </li>
  );
}

/** Decorative, text-free sketch of a terminal session and an Agent approval request. */
function ProductPreview() {
  return (
    <div aria-hidden="true" className="relative h-60 w-full max-w-sm">
      <div className="absolute top-2 left-0 w-60 -rotate-6 rounded-2xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
          <TerminalIcon className="ml-auto size-3.5 text-muted-foreground" />
        </div>
        <div className="mt-4 flex flex-col gap-2.5">
          <SketchLine className="w-3/4" />
          <SketchLine className="w-1/2" />
          <SketchLine className="w-2/3" />
        </div>
      </div>
      <div className="absolute right-0 bottom-0 w-72 rounded-2xl border border-border bg-card p-4 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-muted text-foreground">
            <AgentIcon className="size-4" />
          </span>
          <span className="flex flex-1 flex-col gap-2">
            <SketchLine className="w-28 bg-foreground/20" />
            <SketchLine className="w-16" />
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border bg-muted/60 p-3">
          <SketchLine className="w-5/6" />
          <SketchLine className="w-2/3" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <span className="h-7 w-16 rounded-md border border-border bg-background" />
          <span className="grid h-7 w-16 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <CheckIcon className="size-3.5" />
          </span>
        </div>
      </div>
      <img
        alt=""
        src={markUrl}
        width={96}
        height={96}
        className="absolute top-0 right-6 size-14 drop-shadow-lg"
      />
    </div>
  );
}

function SketchLine({ className }: { className: string }) {
  return <span className={cn("block h-2 rounded-full bg-foreground/10", className)} />;
}
