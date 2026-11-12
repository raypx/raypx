import { useTranslations } from "../../../i18n.js";
import { useEffect, useId, useRef, type RefObject } from "react";

import type { IconComponent } from "@raypx/icons";
import { BookOpenIcon } from "@raypx/icons/book-open";
import { CheckIcon } from "@raypx/icons/check";
import { CheckCircleIcon } from "@raypx/icons/check-circle";
import { FolderOpenIcon } from "@raypx/icons/folder-open";
import { FileTextIcon } from "@raypx/icons/file-text";
import { InboxIcon } from "@raypx/icons/inbox";
import { PauseIcon } from "@raypx/icons/pause";
import { PlayIcon } from "@raypx/icons/play";
import { ScheduleIcon } from "@raypx/icons/schedule";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { TaskListIcon } from "@raypx/icons/task-list";
import { SpinnerIcon } from "@raypx/icons/spinner";
import { TerminalIcon } from "@raypx/icons/terminal";
import { IconButton } from "@raypx/ui/icon-button";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@raypx/ui/components/ui/tabs";
import { cn } from "@raypx/ui/lib/utils";
import { accentGradient } from "../../../components/brand-accent.js";
import {
  demoStage,
  isPreviewStep,
  previewSteps,
  useDemoPlayback,
  type PreviewStep,
} from "./demo-playback.js";

/** The product's own navigation icons; decorative, without names, counts or states. */
const railIcons: readonly { icon: IconComponent; active?: true }[] = [
  { icon: FolderOpenIcon, active: true },
  { icon: InboxIcon },
  { icon: ScheduleIcon },
  { icon: BookOpenIcon },
];

const panelClass = "col-start-1 row-start-1 data-ending-style:hidden";
const reveal = "motion-safe:transition-[opacity,translate] motion-safe:duration-300";

/**
 * An illustrative workflow, independent of account state and execution clients: the
 * application frame holds the example controls and panels together. Panels share a
 * grid cell so changing steps keeps the frame at the same height.
 */
export function WorkflowPreview({ frameRef }: { frameRef: RefObject<HTMLDivElement | null> }) {
  const common = useTranslations("common");
  const t = useTranslations("guest");
  const { rootRef, step, select, enabled, toggle, state, progress, changeSource, hold } =
    useDemoPlayback("review");
  const panelRef = useRef<HTMLDivElement>(null);
  const pointerChange = useRef(false);
  const previousStep = useRef(step);
  const prompt = t("previewPrompt");
  const stage = demoStage(step, progress, prompt.length);

  useEffect(() => {
    const direction = previewSteps.indexOf(step) - previewSteps.indexOf(previousStep.current);
    previousStep.current = step;
    const animated = pointerChange.current || changeSource === "autoplay";
    if (!animated || !direction) return;
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
  }, [step, changeSource]);

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
      title: common("result"),
      hint: t("previewResultHint"),
    },
  ] as const;

  return (
    <Tabs
      ref={rootRef}
      value={step}
      data-autoplay={state}
      onValueChange={(value) => {
        if (isPreviewStep(value)) select(value);
      }}
      onPointerDownCapture={() => {
        pointerChange.current = true;
      }}
      onKeyDownCapture={() => {
        pointerChange.current = false;
      }}
      className="mx-auto w-full max-w-5xl min-w-0"
    >
      <div
        ref={frameRef}
        className="relative isolate min-w-0 rounded-[1.375rem] border border-border bg-background/70 p-1.5 shadow-popover"
      >
        <span
          aria-hidden="true"
          data-hero-frame-light
          className="pointer-events-none absolute inset-x-0 -top-px z-10 h-0.5 rounded-t-[inherit] [background:var(--hero-frame-light,none)] motion-reduce:hidden forced-colors:hidden"
        />
        <figure
          aria-label={t("previewLabel")}
          className="@container/preview min-w-0 overflow-hidden rounded-[1rem] border border-border bg-background"
        >
          <figcaption className="grid min-h-11 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border bg-muted/55 px-3 @md/preview:px-4">
            <span aria-hidden="true" className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-[var(--brand-pink)]/70" />
              <span className="size-2.5 rounded-full bg-[var(--brand-violet)]/70" />
              <span className="size-2.5 rounded-full bg-[var(--brand-sky)]/70" />
            </span>
            <span className="hidden min-w-0 items-center justify-center gap-2 text-xs font-medium @md/preview:flex">
              <FolderOpenIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="truncate">Raypx</span>
            </span>
            <span className="col-start-3 flex items-center gap-1 justify-self-end">
              <Badge variant="outline" className="bg-background">
                {t("previewLabel")}
              </Badge>
              <IconButton
                size="icon-xs"
                label={t("previewAutoplay")}
                hint={t(enabled ? "previewPause" : "previewPlay")}
                aria-pressed={enabled}
                onClick={toggle}
              >
                {enabled ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
              </IconButton>
            </span>
          </figcaption>
          <TabsList
            aria-label={t("previewSteps")}
            variant="line"
            className="grid w-full grid-cols-3 items-stretch gap-0 divide-x divide-border border-b border-border bg-muted/20 p-0 group-data-[orientation=horizontal]/tabs:h-auto"
            onFocus={() => hold.setFocused(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) hold.setFocused(false);
            }}
          >
            {cards.map((card) => (
              <StepCard
                key={card.value}
                progress={card.value === step ? progress : null}
                {...card}
              />
            ))}
          </TabsList>
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
            <div
              className="flex min-w-0 flex-1 flex-col"
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") hold.setHovered(true);
              }}
              onPointerLeave={() => hold.setHovered(false)}
            >
              <div
                ref={panelRef}
                className="mx-auto grid min-h-80 w-full max-w-2xl overflow-hidden px-4 py-5 sm:px-6 @2xl/preview:min-h-88 @2xl/preview:py-7"
              >
                <TabsContent value="session" className={cn(panelClass, "flex flex-col gap-6")}>
                  <div
                    className={cn(
                      "ml-auto max-w-sm rounded-2xl rounded-br-md bg-foreground px-4 py-3 text-sm leading-6 text-background",
                      stage.typed === 0 && "invisible",
                    )}
                  >
                    {prompt.slice(0, stage.typed)}
                    {stage.typed < prompt.length && (
                      <span
                        aria-hidden="true"
                        className="ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-background motion-safe:animate-pulse"
                      />
                    )}
                  </div>
                  <div
                    className={cn(
                      "flex flex-col gap-3",
                      reveal,
                      stage.agent === "hidden" && "translate-y-1 opacity-0",
                    )}
                  >
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
                      {stage.agent === "working" ? (
                        <SpinnerIcon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground motion-safe:animate-spin"
                        />
                      ) : (
                        <CheckIcon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                      )}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="review" className={cn(panelClass, "flex flex-col gap-4")}>
                  <div className="flex items-center justify-end">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-violet)]/30 bg-[var(--brand-violet)]/8 px-2.5 py-0.5 text-xs text-foreground/80">
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
                        <span className="block border-l-2 border-[var(--brand-sky)] bg-background/10 px-4 pl-3.5 dark:bg-foreground/10">
                          + await persist(input);
                        </span>
                        <span className="block border-l-2 border-[var(--brand-sky)] bg-background/10 px-4 pl-3.5 dark:bg-foreground/10">
                          + await sendOnce(input);
                        </span>
                        <span className="block px-4 opacity-60"> return receipt;</span>
                      </code>
                    </pre>
                  </div>
                  <ApprovalRow stage={stage.approval} />
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
                    <h3 className="text-lg font-medium">{common("completed")}</h3>
                  </div>
                  <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                    <li
                      className={cn(
                        "flex items-center gap-3 px-4 py-3.5",
                        reveal,
                        stage.resultRows < 1 && "opacity-0",
                      )}
                    >
                      <FileTextIcon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                      <code className="min-w-0 flex-1 text-xs wrap-anywhere">src/delivery.ts</code>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        +2 −1
                      </span>
                    </li>
                    <li
                      className={cn(
                        "flex items-center gap-3 px-4 py-3.5",
                        reveal,
                        stage.resultRows < 2 && "opacity-0",
                      )}
                    >
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
    </Tabs>
  );
}

function StepCard({
  value,
  icon: Icon,
  title,
  hint,
  progress,
}: {
  value: PreviewStep;
  icon: IconComponent;
  title: string;
  hint: string;
  progress: number | null;
}) {
  const id = useId();
  return (
    <TabsTrigger
      value={value}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`}
      className="group/step h-auto min-h-11 min-w-0 flex-col items-start gap-1 rounded-none px-2.5 py-2.5 text-left whitespace-normal after:hidden hover:bg-muted/40 focus-visible:z-10 data-active:text-foreground @lg/preview:min-h-16 @lg/preview:justify-start @lg/preview:px-4"
    >
      <span
        aria-hidden="true"
        style={progress === null ? undefined : { transform: `scaleX(${progress})` }}
        className={cn(
          "absolute inset-x-0 bottom-0 h-0.5 origin-left opacity-0 group-data-active/step:opacity-100 motion-safe:transition-[opacity,transform] motion-safe:duration-100 motion-safe:ease-linear",
          accentGradient,
        )}
      />
      <span className="flex w-full items-center justify-center gap-1.5 @lg/preview:justify-start @lg/preview:gap-2">
        <Icon aria-hidden="true" />
        <span id={`${id}-title`} className="text-xs font-semibold @lg/preview:text-sm">
          {title}
        </span>
      </span>
      <span
        id={`${id}-hint`}
        className="sr-only text-xs leading-5 font-normal text-pretty text-muted-foreground @lg/preview:not-sr-only"
      >
        {hint}
      </span>
    </TabsTrigger>
  );
}

function ApprovalRow({ stage }: { stage: "waiting" | "pressing" | "approved" }) {
  const common = useTranslations("common");
  const t = useTranslations("guest");
  if (stage === "approved") {
    return (
      <div aria-hidden="true" className="flex justify-end text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--brand-violet)]/30 bg-[var(--brand-violet)]/10 px-2.5 py-1 font-medium">
          <CheckIcon className="size-3.5" />
          {t("previewApproved")}
        </span>
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="flex justify-end gap-2 text-xs">
      <span className="rounded-md border border-border px-2.5 py-1">{common("deny")}</span>
      <span
        className={cn(
          "rounded-md bg-foreground px-2.5 py-1 text-background motion-safe:transition-[scale,box-shadow] motion-safe:duration-150",
          stage === "pressing" &&
            "scale-95 ring-2 ring-[var(--brand-violet)]/50 ring-offset-2 ring-offset-background",
        )}
      >
        {t("exampleApprove")}
      </span>
    </div>
  );
}
