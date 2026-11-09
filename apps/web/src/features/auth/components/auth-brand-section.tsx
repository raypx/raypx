import { CodeFolderIcon } from "@raypx/icons/code-folder";
import { MonitorIcon } from "@raypx/icons/monitor";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import type { IconComponent } from "@raypx/icons";
import { useTranslations } from "@raypx/i18n/browser";
import { cn } from "@raypx/ui/lib/utils";
import { DotGrid } from "../../../components/artwork.tsx";

/** Delays continue the panel's load entrance, one feature at a time. */
const featureDelays = ["motion-safe:delay-300", "motion-safe:delay-500", "motion-safe:delay-700"];

export function AuthBrandSection() {
  const t = useTranslations("auth");
  const features = [
    { icon: MonitorIcon, text: t("featureLocal") },
    { icon: CodeFolderIcon, text: t("featureRemote") },
    { icon: ShieldCheckIcon, text: t("featureApprovals") },
  ] as const;
  return (
    <aside className="relative isolate hidden min-w-0 flex-col justify-center overflow-hidden border-l border-border bg-muted/30 p-10 lg:flex">
      <DotGrid className="mask-[radial-gradient(ellipse_80%_70%_at_100%_100%,#000_10%,transparent_70%)]" />
      <div
        aria-hidden="true"
        className="absolute -top-24 -right-24 -z-10 size-72 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--foreground)_6%,transparent),transparent)]"
      />
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
            {t("brandTitle")}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("brandIntro")}</p>
        </div>
        <ul className="relative flex flex-col gap-4">
          <span
            aria-hidden="true"
            className="absolute top-4 bottom-4 left-4 border-l border-dashed border-foreground/20"
          />
          {features.map(({ icon, text }, index) => (
            <FeatureItem key={text} icon={icon} text={text} delay={featureDelays[index]} />
          ))}
        </ul>
      </div>
    </aside>
  );
}

function FeatureItem({
  icon: Icon,
  text,
  delay,
}: {
  icon: IconComponent;
  text: string;
  delay: string | undefined;
}) {
  return (
    <li
      className={cn(
        "relative flex items-center gap-3 text-sm leading-relaxed motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 motion-safe:duration-500 motion-safe:fill-mode-both",
        delay,
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background shadow-soft">
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
      </span>
      {text}
    </li>
  );
}
