import { useEffect, useRef, useState } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import type { IconComponent } from "@raypx/icons";
import { BookOpenIcon } from "@raypx/icons/book-open";
import { CheckIcon } from "@raypx/icons/check";
import { CheckCircleIcon } from "@raypx/icons/check-circle";
import { FolderOpenIcon } from "@raypx/icons/folder-open";
import { FileTextIcon } from "@raypx/icons/file-text";
import { InboxIcon } from "@raypx/icons/inbox";
import { ScheduleIcon } from "@raypx/icons/schedule";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { TaskListIcon } from "@raypx/icons/task-list";
import { TerminalIcon } from "@raypx/icons/terminal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@raypx/ui/components/ui/tabs";
import { cn } from "@raypx/ui/lib/utils";

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

/** The product's own navigation icons; decorative, without names, counts or states. */
const railIcons: readonly { icon: IconComponent; active?: true }[] = [
  { icon: FolderOpenIcon, active: true },
  { icon: InboxIcon },
  { icon: ScheduleIcon },
  { icon: BookOpenIcon },
];

const panelClass = "col-start-1 row-start-1 data-ending-style:hidden";

/**
 * An illustrative workflow in an application frame, independent of account state and
 * execution clients. Panels share one grid cell so the frame keeps its height.
 */
export function WorkflowPreview({ className }: { className?: string }) {
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
      className={cn(
        "@container/preview min-w-0 overflow-hidden rounded-2xl border border-border bg-background",
        className,
      )}
    >
      <figcaption className="flex h-11 items-center gap-3 border-b border-border bg-muted/60 px-4">
        <span aria-hidden="true" className="flex w-14 shrink-0 gap-1.5">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </span>
        <span className="flex min-w-0 flex-1 items-center justify-center gap-2 text-xs font-medium">
          <FolderOpenIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">Raypx</span>
        </span>
        <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
          {t("previewLabel")}
        </span>
      </figcaption>
      <div className="flex min-w-0">
        <div
          aria-hidden="true"
          className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar py-3 @2xl/preview:flex"
        >
          {railIcons.map(({ icon: Icon, active }, index) => (
            <span
              key={index}
              className={cn(
                "grid size-9 place-items-center rounded-lg text-muted-foreground",
                active && "bg-sidebar-accent text-foreground",
              )}
            >
              <Icon className="size-5 stroke-[1.75]" />
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
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
            <div className="border-b border-border px-5">
              <div className="relative mx-auto max-w-md">
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
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5"
                >
                  <div
                    className={cn(
                      "h-full w-1/3 bg-foreground motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] group-has-[:focus-visible]/preview:transition-none",
                      stepPositions[step],
                    )}
                  />
                </div>
              </div>
            </div>
            <div
              ref={panelRef}
              className="mx-auto grid min-h-80 w-full max-w-2xl overflow-hidden px-5 py-6 sm:px-6 @2xl/preview:py-8"
            >
              <TabsContent value="session" className={cn(panelClass, "flex flex-col gap-6")}>
                <div className="ml-auto max-w-sm rounded-2xl rounded-br-md bg-foreground px-4 py-3 text-sm leading-6 text-background">
                  {t("previewPrompt")}
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <TerminalIcon aria-hidden="true" className="size-4" />
                    Agent
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs">
                    <code className="min-w-0 wrap-anywhere">read src/delivery.ts</code>
                    <CheckIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="review" className={cn(panelClass, "flex flex-col gap-4")}>
                <div className="flex items-center justify-end">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                    <ShieldCheckIcon aria-hidden="true" className="size-3.5" />
                    {t("previewNeedsYou")}
                  </span>
                </div>
                <div className="overflow-hidden rounded-xl bg-foreground text-background dark:border dark:border-border dark:bg-muted/40 dark:text-foreground">
                  <div className="flex items-center justify-between gap-3 border-b border-current/15 px-4 py-3 text-xs">
                    <code className="min-w-0 wrap-anywhere">src/delivery.ts</code>
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
              <TabsContent value="result" className={cn(panelClass, "flex flex-col gap-5")}>
                <div className="flex items-center gap-3">
                  <CheckCircleIcon aria-hidden="true" className="size-7 shrink-0" />
                  <h3 className="text-lg font-medium">{t("previewResultTitle")}</h3>
                </div>
                <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                  <li className="flex items-center gap-3 px-4 py-3.5">
                    <FileTextIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <code className="min-w-0 flex-1 text-xs wrap-anywhere">src/delivery.ts</code>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      +2 −1
                    </span>
                  </li>
                  <li className="flex items-center gap-3 px-4 py-3.5">
                    <InboxIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="flex-1">{t("previewReceipt")}</span>
                    <CheckIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  </li>
                </ul>
              </TabsContent>
            </div>
          </Tabs>
          <p className="mt-auto border-t border-border px-5 py-3 text-xs leading-5 text-muted-foreground">
            {t("previewNotice")}
          </p>
        </div>
      </div>
    </figure>
  );
}
