import type { ToolActivity, WebSources } from "@raypx/core/conversation";
import { ArrowUpRightIcon } from "@raypx/icons/arrow-up-right";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { GlobalIcon } from "@raypx/icons/global";
import { Button } from "@raypx/ui/components/ui/button";
import { CapabilitySheet } from "./capability-sheet.js";
import { useTranslations } from "./i18n.js";

export function WebSourceCard({
  activity,
  delegated,
  onOpen,
}: {
  activity: readonly ToolActivity[];
  delegated: readonly { activity: readonly ToolActivity[] }[];
  onOpen: (sources: WebSources, opener: HTMLButtonElement) => void;
}) {
  const t = useTranslations("agents");
  const unique = new Map<string, WebSources[number]>();
  for (const call of [...activity, ...delegated.flatMap((work) => work.activity)]) {
    if (call.outcome !== "succeeded") continue;
    for (const source of call.webSources ?? []) {
      const previous = unique.get(source.url);
      if (previous) {
        unique.set(source.url, { ...previous, excerpt: source.excerpt || previous.excerpt });
      } else if (unique.size < 20) unique.set(source.url, source);
    }
  }
  if (!unique.size) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      aria-haspopup="dialog"
      className="min-h-11 self-start"
      onClick={(event) => onOpen([...unique.values()], event.currentTarget)}
    >
      <GlobalIcon data-icon="inline-start" aria-hidden="true" />
      {t("webSources.count", { count: unique.size })}
      <ChevronRightIcon data-icon="inline-end" aria-hidden="true" />
    </Button>
  );
}

export function WebSourceSheet({
  sources,
  open,
  onClose,
  finalFocus,
  onOpenExternal,
}: {
  sources: WebSources;
  open: boolean;
  onClose: () => void;
  finalFocus: () => HTMLElement | false;
  onOpenExternal: ((url: string) => void) | undefined;
}) {
  const t = useTranslations("agents");
  return (
    <CapabilitySheet
      open={open}
      onClose={onClose}
      finalFocus={finalFocus}
      title={t("webSources.title")}
      closeLabel={t("close")}
      className="data-[side=right]:w-full sm:data-[side=right]:max-w-xl"
    >
      <ol className="flex min-w-0 flex-col divide-y">
        {sources.map((source) => (
          <li key={source.url} className="flex min-w-0 flex-col gap-1 py-3 first:pt-0">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 rounded-sm font-medium wrap-anywhere text-primary hover:underline focus-visible:focus-control"
              onClick={(event) => {
                if (!onOpenExternal) return;
                event.preventDefault();
                onOpenExternal(source.url);
              }}
            >
              {source.title}
              <ArrowUpRightIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            </a>
            <p className="text-xs wrap-anywhere text-muted-foreground">
              {new URL(source.url).hostname}
            </p>
            {source.excerpt && (
              <p className="mt-1 text-sm leading-relaxed wrap-anywhere">{source.excerpt}</p>
            )}
          </li>
        ))}
      </ol>
    </CapabilitySheet>
  );
}
