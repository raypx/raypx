import { useEffect, useId, useRef, useState } from "react";
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
import { accentGradient, scrollSettle } from "./accent.ts";

const steps = ["session", "review", "result"] as const;
type PreviewStep = (typeof steps)[number];

function isPreviewStep(value: unknown): value is PreviewStep {
  return steps.some((step) => step === value);
}

/** The product's own navigation icons; decorative, without names, counts or states. */
const railIcons: readonly { icon: IconComponent; active?: true }[] = [
  { icon: FolderOpenIcon, active: true },
  { icon: InboxIcon },
  { icon: ScheduleIcon },
  { icon: BookOpenIcon },
];

const panelClass = "col-start-1 row-start-1 data-ending-style:hidden";

/**
 * An illustrative workflow, independent of account state and execution clients: the
 * application frame shows the selected step and the step cards below select it. Panels
 * share one grid cell so the frame keeps its height.
 */
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

  const cards = [
    {
      value: "session",
      icon: TaskListIcon,
      title: t("previewSession"),
      hint: t("previewSessionHint"),
    },
    {
      value: "review",
      icon: ShieldCheckIcon,
      title: t("previewReview"),
      hint: t("previewReviewHint"),
    },
    {
      value: "result",
      icon: CheckCircleIcon,
      title: t("previewResult"),
      hint: t("previewResultHint"),
    },
  ] as const;

  return (
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
      className="mx-auto w-full max-w-5xl min-w-0 gap-8 @3xl/main:gap-10"
    >
      <div className="relative min-w-0">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[8%] -top-16 bottom-1/4 -z-10 bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--landing-blue)_32%,transparent),transparent)] opacity-60 blur-3xl dark:opacity-80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/4 right-0 -bottom-10 left-1/2 -z-10 bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--landing-pink)_26%,transparent),transparent)] opacity-60 blur-3xl dark:opacity-70"
        />
        <div
          className={cn(
            "relative isolate rounded-[1.375rem] border border-border bg-background/60 p-1.5 shadow-popover backdrop-blur-sm",
            scrollSettle,
          )}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-px overflow-hidden rounded-[inherit] p-px [mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)] motion-reduce:hidden"
          >
            <span className="absolute top-1/2 left-1/2 aspect-square w-[150%] -translate-1/2 animate-spin bg-[conic-gradient(from_0deg,transparent_0deg,transparent_240deg,var(--landing-sky)_290deg,var(--landing-violet)_320deg,var(--landing-pink)_345deg,transparent_360deg)] [animation-duration:8s]" />
          </span>
          <figure
            aria-label={t("previewLabel")}
            className="@container/preview min-w-0 overflow-hidden rounded-[1rem] border border-border bg-background"
          >
            <figcaption className="grid h-11 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border bg-muted/60 px-4">
              <span aria-hidden="true" className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-[var(--landing-pink)]/70" />
                <span className="size-2.5 rounded-full bg-[var(--landing-violet)]/70" />
                <span className="size-2.5 rounded-full bg-[var(--landing-sky)]/70" />
              </span>
              <span className="hidden min-w-0 items-center justify-center gap-2 text-xs font-medium @md/preview:flex">
                <FolderOpenIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
                <span className="truncate">Raypx</span>
              </span>
              <span className="col-start-3 justify-self-end rounded-full border border-border bg-background px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground">
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
                <div
                  ref={panelRef}
                  className="mx-auto grid min-h-72 w-full max-w-2xl overflow-hidden px-5 py-6 sm:px-6 @2xl/preview:min-h-80 @2xl/preview:py-8"
                >
                  <TabsContent value="session" className={cn(panelClass, "flex flex-col gap-6")}>
                    <div className="ml-auto max-w-sm rounded-2xl rounded-br-md bg-foreground px-4 py-3 text-sm leading-6 text-background">
                      {t("previewPrompt")}
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-5 place-items-center rounded-md text-white",
                            accentGradient,
                          )}
                        >
                          <TerminalIcon className="size-3" />
                        </span>
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
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--landing-violet)]/30 bg-[var(--landing-violet)]/8 px-2.5 py-0.5 text-xs text-foreground/80">
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
                          <span className="block border-l-2 border-[var(--landing-sky)] bg-background/10 px-4 pl-3.5 dark:bg-foreground/10">
                            + await persist(input);
                          </span>
                          <span className="block border-l-2 border-[var(--landing-sky)] bg-background/10 px-4 pl-3.5 dark:bg-foreground/10">
                            + await sendOnce(input);
                          </span>
                          <span className="block px-4 opacity-60"> return receipt;</span>
                        </code>
                      </pre>
                    </div>
                  </TabsContent>
                  <TabsContent value="result" className={cn(panelClass, "flex flex-col gap-5")}>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-full text-white",
                          accentGradient,
                        )}
                      >
                        <CheckIcon className="size-4" />
                      </span>
                      <h3 className="text-lg font-medium">{t("previewResultTitle")}</h3>
                    </div>
                    <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                      <li className="flex items-center gap-3 px-4 py-3.5">
                        <FileTextIcon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                        <code className="min-w-0 flex-1 text-xs wrap-anywhere">
                          src/delivery.ts
                        </code>
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
                <p className="mt-auto border-t border-border px-5 py-3 text-xs leading-5 text-muted-foreground">
                  {t("previewNotice")}
                </p>
              </div>
            </div>
          </figure>
        </div>
      </div>
      <TabsList
        aria-label={t("previewSteps")}
        className="grid w-full grid-cols-3 items-stretch gap-2 bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto @2xl/main:gap-4"
      >
        {cards.map((card, index) => (
          <StepCard key={card.value} index={index} {...card} />
        ))}
      </TabsList>
    </Tabs>
  );
}

function StepCard({
  value,
  icon: Icon,
  title,
  hint,
  index,
}: {
  value: PreviewStep;
  icon: IconComponent;
  title: string;
  hint: string;
  index: number;
}) {
  const id = useId();
  return (
    <TabsTrigger
      value={value}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`}
      className="group/step relative h-auto min-w-0 flex-col items-center justify-start gap-3 overflow-hidden rounded-2xl border-border bg-card/60 p-3 text-center whitespace-normal text-foreground after:hidden hover:border-foreground/20 data-active:border-foreground/15 data-active:bg-card data-active:shadow-soft dark:data-active:border-foreground/20 dark:data-active:bg-card @2xl/main:items-start @2xl/main:p-5 @2xl/main:text-left"
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 top-0 h-0.5 opacity-0 group-data-active/step:opacity-100 motion-safe:transition-opacity motion-safe:duration-200",
          accentGradient,
        )}
      />
      <span className="flex w-full flex-col items-center gap-2 @2xl/main:flex-row @2xl/main:gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-muted/60 text-muted-foreground group-data-active/step:border-transparent group-data-active/step:bg-foreground group-data-active/step:text-background motion-safe:transition-colors motion-safe:duration-200">
          <Icon aria-hidden="true" className="size-4.5" />
        </span>
        <span id={`${id}-title`} className="text-sm font-medium">
          {title}
        </span>
        <span
          aria-hidden="true"
          className="ml-auto hidden text-xs text-muted-foreground tabular-nums @2xl/main:inline"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
      </span>
      <span
        id={`${id}-hint`}
        className="hidden text-sm leading-6 font-normal text-pretty text-muted-foreground @2xl/main:block"
      >
        {hint}
      </span>
    </TabsTrigger>
  );
}
