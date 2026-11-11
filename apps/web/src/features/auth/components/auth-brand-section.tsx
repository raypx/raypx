import { CodeFolderIcon } from "@raypx/icons/code-folder";
import { MonitorIcon } from "@raypx/icons/monitor";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { TerminalWindowIcon } from "@raypx/icons/terminal-window";
import type { IconComponent } from "@raypx/icons";
import { useTranslations } from "@raypx/i18n/browser";
import { cn } from "@raypx/ui/lib/utils";
import { DotGrid } from "../../../components/artwork.js";
import { accentGradient } from "../../../components/brand-accent.js";

/**
 * Product facts beside the authentication form. Decoration uses the logo palette and an
 * example approval labelled as such; nothing here moves or reads account state.
 */
export function AuthBrandSection() {
  const t = useTranslations("auth");
  const features = [
    { icon: MonitorIcon, text: t("featureLocal") },
    { icon: ShieldCheckIcon, text: t("featureApprovals") },
    { icon: CodeFolderIcon, text: t("featureRemote") },
  ] as const;
  return (
    <aside className="relative isolate hidden min-w-0 flex-col justify-center gap-9 overflow-hidden border-l border-border bg-muted/30 p-10 lg:flex">
      <DotGrid className="mask-[radial-gradient(ellipse_80%_70%_at_100%_100%,#000_10%,transparent_70%)]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -right-16 -z-10 h-64 w-72 rounded-full bg-[var(--brand-violet)] opacity-[0.16] blur-[70px] dark:opacity-[0.26]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-12 -z-10 h-60 w-64 rounded-full bg-[var(--brand-sky)] opacity-[0.14] blur-[70px] dark:opacity-[0.22]"
      />
      <div className="flex flex-col gap-3">
        <span aria-hidden="true" className={cn("h-1 w-10 rounded-full", accentGradient)} />
        <h2 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
          {t("brandTitle")}
        </h2>
        <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
          {t("brandIntro")}
        </p>
      </div>
      <ol className="relative flex flex-col gap-3.5">
        <span
          aria-hidden="true"
          className="absolute top-4 bottom-4 left-4 w-px bg-linear-to-b from-[var(--brand-sky)] via-[var(--brand-violet)] to-[var(--brand-pink)] opacity-40"
        />
        {features.map(({ icon, text }, index) => (
          <FeatureItem key={text} icon={icon} text={text} index={index} />
        ))}
      </ol>
      <ExampleApproval />
    </aside>
  );
}

function FeatureItem({
  icon: Icon,
  text,
  index,
}: {
  icon: IconComponent;
  text: string;
  index: number;
}) {
  return (
    <li className="relative flex items-center gap-3 text-sm leading-relaxed">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background shadow-soft">
        <Icon aria-hidden="true" className="size-4 text-foreground" />
      </span>
      <span className="min-w-0 flex-1">{text}</span>
      <span
        aria-hidden="true"
        className={cn(
          "bg-clip-text font-mono text-xs font-medium text-transparent tabular-nums forced-colors:bg-none forced-colors:text-[CanvasText]",
          accentGradient,
        )}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
    </li>
  );
}

function ExampleApproval() {
  const t = useTranslations("guest");
  return (
    <div
      aria-hidden="true"
      className="relative flex flex-col gap-3 rounded-xl border border-border bg-background/90 p-3.5 shadow-soft backdrop-blur-sm"
    >
      <span className="absolute -top-2.5 right-3 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
        {t("example")}
      </span>
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <span
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-md text-white",
            accentGradient,
          )}
        >
          <TerminalWindowIcon className="size-3" />
        </span>
        <span className="font-medium">Agent</span>
        <span className="ml-auto truncate text-muted-foreground">{t("previewNeedsYou")}</span>
      </div>
      <code className="truncate rounded-md bg-muted px-2.5 py-1.5 text-xs">bun run db:migrate</code>
      <div className="flex justify-end gap-2 text-xs">
        <span className="rounded-md border border-border px-2.5 py-1">{t("exampleDeny")}</span>
        <span className="rounded-md bg-foreground px-2.5 py-1 text-background">
          {t("exampleApprove")}
        </span>
      </div>
    </div>
  );
}
