import { cn } from "@raypx/ui/lib/utils";

// The eight-ray indicator is adapted from affectUI's Thinking Loader (MIT).
const rayOpacity = [0.18, 0.29, 0.41, 0.53, 0.64, 0.76, 0.88, 1];

export function ReplyWaiting({ label, running }: { label: string; running: boolean }) {
  return (
    <span
      data-reply-waiting=""
      className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-info-border bg-info-bg px-2.5 py-1 text-info-text"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className={cn(
          "size-3.5 shrink-0",
          running &&
            "motion-safe:animate-spin motion-safe:[animation-duration:800ms] motion-safe:[animation-timing-function:steps(8)]",
        )}
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        {rayOpacity.map((opacity, index) => (
          <line
            key={opacity}
            x1="8"
            y1="1.75"
            x2="8"
            y2="4.75"
            transform={`rotate(${index * 45} 8 8)`}
            strokeOpacity={opacity}
          />
        ))}
      </svg>
      <span className="wrap-anywhere">{label}</span>
    </span>
  );
}
