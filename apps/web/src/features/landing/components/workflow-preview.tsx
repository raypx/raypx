import type { RefObject } from "react";
import { Logo } from "@raypx/ui/logo";
import { AgentIcon } from "@raypx/icons/agent";
import { FolderIcon } from "@raypx/icons/folder";
import { PlusIcon } from "@raypx/icons/plus";
import { MonitorIcon } from "@raypx/icons/monitor";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { FileTextIcon } from "@raypx/icons/file-text";
import { useTranslations } from "../../../i18n.js";

/** The redesigned home composer, illustrated without inputs, execution or private reads. */
export function WorkflowPreview({ frameRef }: { frameRef: RefObject<HTMLDivElement | null> }) {
  const t = useTranslations("guest");
  return (
    <div
      ref={frameRef}
      className="relative w-full max-w-5xl min-w-0 rounded-2xl border border-border bg-background p-1.5 shadow-popover"
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
        <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-xs text-muted-foreground">
          <span>Raypx</span>
          <span>{t("previewLabel")}</span>
        </figcaption>
        <div className="flex min-h-88 min-w-0 sm:min-h-96">
          <aside
            aria-hidden="true"
            className="hidden w-44 shrink-0 flex-col gap-6 bg-muted/50 p-4 sm:flex"
          >
            <span className="flex items-center gap-2 text-sm">
              <FolderIcon className="size-4" />
              <span className="truncate">{t("previewSpace")}</span>
            </span>
            <div className="flex flex-col gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-2 rounded-lg bg-background p-2 text-foreground">
                <AgentIcon className="size-4 shrink-0" />
                <span className="truncate">{t("previewAgent")}</span>
              </span>
              <span className="px-2">{t("previewGroup")}</span>
              <span className="px-2">{t("previewMemory")}</span>
              <span className="px-2">{t("previewPage")}</span>
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-5 px-4 py-8 sm:px-8">
            <Logo label="Raypx" aria-hidden="true" className="[&>span]:hidden [&>img]:size-8" />
            <h2 className="max-w-full text-center text-xl font-medium tracking-tight text-balance">
              {t("previewQuestion")}
            </h2>
            <div className="flex w-full max-w-xl min-w-0 flex-col gap-5 rounded-3xl border border-border bg-background p-4 shadow-soft">
              <p className="min-h-10 text-sm leading-6 text-muted-foreground">
                {t("previewPrompt")}
              </p>
              <div className="flex w-fit max-w-full items-center gap-2 rounded-lg border border-border px-2 py-1 text-xs">
                <FileTextIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="truncate">{t("previewAttachment")}</span>
              </div>
              <div
                aria-hidden="true"
                className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
              >
                <PlusIcon className="size-4 shrink-0" />
                <span className="flex min-w-0 items-center gap-1 rounded-full bg-muted px-2 py-1">
                  <AgentIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{t("previewAgent")}</span>
                </span>
                <MonitorIcon className="size-4 shrink-0" />
                <span className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <ArrowRightIcon className="size-4" />
                </span>
              </div>
            </div>
          </div>
        </div>
        <p className="border-t border-border px-4 py-3 text-xs leading-5 text-muted-foreground">
          {t("previewNotice")}
        </p>
      </figure>
    </div>
  );
}
