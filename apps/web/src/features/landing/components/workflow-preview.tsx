import type { RefObject } from "react";
import { AgentIcon } from "@raypx/icons/agent";
import { useTranslations } from "../../../i18n.js";

/** A labelled static conversation example; it neither sends nor simulates execution. */
export function WorkflowPreview({ frameRef }: { frameRef: RefObject<HTMLDivElement | null> }) {
  const t = useTranslations("guest");
  return (
    <div
      ref={frameRef}
      className="relative w-full max-w-4xl min-w-0 rounded-2xl border border-border bg-background p-1.5 shadow-popover"
    >
      <span
        aria-hidden="true"
        data-hero-frame-light
        className="pointer-events-none absolute inset-x-0 -top-px h-0.5 [background:var(--hero-frame-light,none)] motion-reduce:hidden"
      />
      <figure
        aria-label={t("previewLabel")}
        className="min-w-0 overflow-hidden rounded-xl border border-border"
      >
        <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-5 py-3 text-xs text-muted-foreground">
          <span>Raypx</span>
          <span>{t("previewLabel")}</span>
        </figcaption>
        <div className="mx-auto flex min-h-64 max-w-2xl flex-col gap-5 px-5 py-7 sm:px-8">
          <p className="ml-auto max-w-sm rounded-xl bg-muted px-4 py-3 text-sm leading-6">
            {t("previewPrompt")}
          </p>
          <div className="flex items-start gap-3">
            <AgentIcon aria-hidden="true" className="mt-1 size-5 shrink-0" />
            <p className="text-sm leading-7">{t("previewReply")}</p>
          </div>
          <p className="ml-auto max-w-sm rounded-xl bg-muted px-4 py-3 text-sm leading-6">
            {t("previewFollowUp")}
          </p>
        </div>
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          {t("previewNotice")}
        </p>
      </figure>
    </div>
  );
}
