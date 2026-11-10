import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export const previewSteps = ["session", "review", "result"] as const;
export type PreviewStep = (typeof previewSteps)[number];

export const stepDurations: Record<PreviewStep, number> = {
  session: 6000,
  review: 5200,
  result: 4200,
};
const startDelay = 1200;
const commitInterval = 50;

export type AgentStage = "hidden" | "working" | "done";
export type ApprovalStage = "waiting" | "pressing" | "approved";
export type DemoStage = {
  typed: number;
  agent: AgentStage;
  approval: ApprovalStage;
  resultRows: number;
};
export type AutoplayState = "playing" | "paused" | "off";
export type ChangeSource = "autoplay" | "visitor";
type AutoplayPreference = "auto" | "on" | "off";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(notify: () => void) {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}

/** Server and hydration renders assume motion is allowed; the client value follows. */
function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function agentStage(progress: number): AgentStage {
  if (progress < 0.5) return "hidden";
  if (progress < 0.8) return "working";
  return "done";
}

function approvalStage(progress: number): ApprovalStage {
  if (progress < 0.55) return "waiting";
  if (progress < 0.68) return "pressing";
  return "approved";
}

function visibleResultRows(progress: number) {
  if (progress < 0.12) return 0;
  if (progress < 0.32) return 1;
  return 2;
}

function autoplayState(enabled: boolean, playing: boolean): AutoplayState {
  if (!enabled) return "off";
  return playing ? "playing" : "paused";
}

export function isPreviewStep(value: unknown): value is PreviewStep {
  return previewSteps.some((step) => step === value);
}

export function nextStep(step: PreviewStep): PreviewStep {
  return previewSteps[(previewSteps.indexOf(step) + 1) % previewSteps.length] ?? "session";
}

/**
 * What a step shows at a playback progress between 0 and 1. A still frame (`null`) shows
 * each step complete, except review, which waits for an answer.
 */
export function demoStage(
  step: PreviewStep,
  progress: number | null,
  promptLength: number,
): DemoStage {
  const still: DemoStage = {
    typed: promptLength,
    agent: "done",
    approval: "waiting",
    resultRows: 2,
  };
  if (progress === null) return still;
  if (step === "session") {
    return {
      ...still,
      typed: Math.round(clamp(progress / 0.4) * promptLength),
      agent: agentStage(progress),
    };
  }
  if (step === "review") return { ...still, approval: approvalStage(progress) };
  return { ...still, resultRows: visibleResultRows(progress) };
}

/**
 * Plays the example's steps in order once it has been visible for a moment. Hovering the
 * content or focusing the step cards holds it, leaving the viewport or tab pauses it,
 * choosing a step stops it and reduced motion starts it off. Browsers without
 * IntersectionObserver never start it.
 */
export function useDemoPlayback(initial: PreviewStep) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(initial);
  const reducedMotion = useReducedMotion();
  const [preference, setPreference] = useState<AutoplayPreference>("auto");
  const enabled = preference === "on" || (preference === "auto" && !reducedMotion);
  const [started, setStarted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [changeSource, setChangeSource] = useState<ChangeSource>("visitor");
  const stepRef = useRef(step);
  const elapsedRef = useRef(0);
  const playing = enabled && started && visible && !hovered && !focused;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    let intersecting = false;
    const update = () => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry?.isIntersecting ?? false;
        update();
      },
      { threshold: 0.3 },
    );
    observer.observe(root);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if (!enabled || started || !visible) return;
    const timer = window.setTimeout(() => setStarted(true), startDelay);
    return () => window.clearTimeout(timer);
  }, [enabled, started, visible]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    let committed = last;
    const loop = (now: number) => {
      elapsedRef.current += Math.min(now - last, 100);
      last = now;
      const current = stepRef.current;
      if (elapsedRef.current >= stepDurations[current]) {
        const next = nextStep(current);
        elapsedRef.current = 0;
        stepRef.current = next;
        committed = now;
        setChangeSource("autoplay");
        setStep(next);
        setElapsed(0);
      } else if (now - committed >= commitInterval) {
        committed = now;
        setElapsed(elapsedRef.current);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const select = useCallback((value: PreviewStep) => {
    stepRef.current = value;
    elapsedRef.current = 0;
    setElapsed(0);
    setChangeSource("visitor");
    setStep(value);
    setPreference("off");
  }, []);

  const toggle = useCallback(() => {
    if (enabled) {
      setPreference("off");
      return;
    }
    elapsedRef.current = 0;
    setElapsed(0);
    setStarted(true);
    setPreference("on");
  }, [enabled]);

  const live = enabled && started;
  const state = autoplayState(enabled, playing);

  return {
    rootRef,
    step,
    select,
    enabled,
    toggle,
    state,
    progress: live ? Math.min(1, elapsed / stepDurations[step]) : null,
    changeSource,
    hold: { setHovered, setFocused },
  };
}
