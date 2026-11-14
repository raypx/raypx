import { useTranslations } from "../../../i18n.js";
import { CodeFolderIcon } from "@raypx/icons/code-folder";
import { MonitorIcon } from "@raypx/icons/monitor";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import type { IconComponent } from "@raypx/icons";

import { cn } from "@raypx/ui/lib/utils";
import { DotGrid } from "../../../components/artwork.js";
import { accentGradient } from "../../../components/brand-accent.js";

/**
 * Product facts beside the authentication form. No email-admission promise, animation
 * or private account read belongs in this static panel.
 */
export function AuthBrandSection() {
  const t = useTranslations("guest");
  const features = [
    { icon: MonitorIcon, text: t("authFactAgents") },
    { icon: ShieldCheckIcon, text: t("authFactControl") },
    { icon: CodeFolderIcon, text: t("authFactTogether") },
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
          {t("authTitle")}
        </h2>
        <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
          {t("authSummary")}
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
