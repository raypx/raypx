import { useEffect, useRef, useState } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import { CheckIcon } from "@raypx/icons/check";
import { CheckCircleIcon } from "@raypx/icons/check-circle";
import { FolderOpenIcon } from "@raypx/icons/folder-open";
import { FileTextIcon } from "@raypx/icons/file-text";
import { InboxIcon } from "@raypx/icons/inbox";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { TaskListIcon } from "@raypx/icons/task-list";
import { TerminalIcon } from "@raypx/icons/terminal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@raypx/ui/components/ui/tabs";

const steps = ["session", "review", "result"] as const;
type PreviewStep = (typeof steps)[number];

function isPreviewStep(value: unknown): value is PreviewStep {
  return steps.some((step) => step === value);
}

const stepPositions: Record<PreviewStep, string> = {
  session: "translate-x-0",
  review: "translate-x-full",
  result: "translate-x-[200%]",
};

/** An illustrative workflow, independent of account state and execution clients. */
export function WorkflowPreview() {
  const t = useTranslations("guest");
  const [step, setStep] = useState<PreviewStep>("review");
  const panelRef = useRef<HTMLDivElement>(null);
  const pointerChange = useRef(false);
  const previousStep = useRef(step);

  useEffect(() => {
    const direction = steps.indexOf(step) - steps.indexOf(previousStep.current);
    previousStep.current = step;
    if (!pointerChange.current || !direction) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const panel = panelRef.current?.querySelector<HTMLElement>(
      '[role="tabpanel"]:not([hidden]):not([inert])',
    );
    if (!panel?.animate) return;
    const animation = panel.animate(
      [
        { opacity: 0.5, transform: `translateX(${Math.sign(direction) * 10}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
    return () => animation.cancel();
  }, [step]);

  return (
    <figure
      aria-label={t("previewLabel")}
      className="min-w-0 overflow-hidden rounded-2xl border border-border bg-sidebar"
    >
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-muted/60 px-5 py-4">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <FolderOpenIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          Raypx
        </span>
        <span className="text-xs text-muted-foreground">{t("previewLabel")}</span>
      </figcaption>
      <Tabs
        value={step}
        onValueChange={(value) => {
          if (isPreviewStep(value)) setStep(value);
        }}
        onPointerDownCapture={() => {
          pointerChange.current = true;
        }}
        onKeyDownCapture={() => {
          pointerChange.current = false;
        }}
        className="group/preview gap-0"
      >
        <div className="relative border-b border-border px-5">
          <TabsList
            variant="line"
            aria-label={t("previewSteps")}
            className="grid h-12 w-full grid-cols-3 gap-0 p-0"
          >
            <TabsTrigger value="session" className="gap-2 after:hidden">
              <TaskListIcon aria-hidden="true" />
              {t("previewSession")}
            </TabsTrigger>
            <TabsTrigger value="review" className="gap-2 after:hidden">
              <ShieldCheckIcon aria-hidden="true" />
              {t("previewReview")}
            </TabsTrigger>
            <TabsTrigger value="result" className="gap-2 after:hidden">
              <CheckCircleIcon aria-hidden="true" />
              {t("previewResult")}
            </TabsTrigger>
          </TabsList>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-5 bottom-0 h-0.5">
            <div
              className={`h-full w-1/3 bg-foreground motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] group-has-[:focus-visible]/preview:transition-none ${stepPositions[step]}`}
            />
          </div>
        </div>
        <div ref={panelRef} className="grid min-h-68 overflow-hidden px-5 py-6 sm:min-h-72 sm:px-6">
          <TabsContent
            value="session"
            className="col-start-1 row-start-1 data-ending-style:hidden space-y-6"
          >
            <div className="ml-8 rounded-xl bg-foreground px-4 py-3 text-sm leading-6 text-background">
              {t("previewPrompt")}
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <TerminalIcon aria-hidden="true" className="size-4" />
                Agent
              </div>
              <div className="flex items-center justify-between gap-3 border-y border-border py-3 text-xs">
                <code>read src/delivery.ts</code>
                <CheckIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              </div>
            </div>
          </TabsContent>
          <TabsContent
            value="review"
            className="col-start-1 row-start-1 data-ending-style:hidden space-y-5"
          >
            <div className="flex items-center justify-end">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheckIcon aria-hidden="true" className="size-3.5" />
                {t("previewNeedsYou")}
              </span>
            </div>
            <div className="overflow-hidden rounded-lg bg-foreground text-background dark:bg-background dark:text-foreground">
              <div className="flex items-center justify-between gap-3 border-b border-current/15 px-4 py-3 text-xs">
                <code>src/delivery.ts</code>
                <span className="shrink-0 tabular-nums opacity-60">+2 −1</span>
              </div>
              <pre
                className="py-4 text-xs leading-7 whitespace-pre-wrap wrap-anywhere sm:text-sm"
                role="region"
                aria-label={t("previewDiff")}
              >
                <code>
                  <span className="block px-4 opacity-65">- send(input);</span>
                  <span className="block bg-background/10 px-4 dark:bg-foreground/10">
                    + await persist(input);
                  </span>
                  <span className="block bg-background/10 px-4 dark:bg-foreground/10">
                    + await sendOnce(input);
                  </span>
                  <span className="block px-4 opacity-60"> return receipt;</span>
                </code>
              </pre>
            </div>
          </TabsContent>
          <TabsContent
            value="result"
            className="col-start-1 row-start-1 data-ending-style:hidden space-y-5"
          >
            <div className="flex items-center gap-3">
              <CheckCircleIcon aria-hidden="true" className="size-7 shrink-0" />
              <h3 className="text-lg font-medium">{t("previewResultTitle")}</h3>
            </div>
            <ul className="divide-y divide-border border-y border-border text-sm">
              <li className="flex items-center gap-3 py-4">
                <FileTextIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <code className="min-w-0 flex-1 text-xs wrap-anywhere">src/delivery.ts</code>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">+2 −1</span>
              </li>
              <li className="flex items-center gap-3 py-4">
                <InboxIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{t("previewReceipt")}</span>
                <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              </li>
            </ul>
          </TabsContent>
        </div>
      </Tabs>
      <p className="border-t border-border px-5 py-3 text-xs leading-5 text-muted-foreground">
        {t("previewNotice")}
      </p>
    </figure>
  );
}
