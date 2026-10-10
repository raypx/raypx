"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "../lib/utils.js";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value = null, max = 100, ...props }, ref) => {
  const maximum = Number.isFinite(max) && max > 0 ? max : 100;
  const progress =
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(maximum, Math.max(0, value))
      : null;
  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={progress}
      max={maximum}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/20", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-primary transition-transform data-[state=indeterminate]:animate-pulse"
        style={{
          transform: `translateX(-${progress === null ? 50 : 100 - (progress / maximum) * 100}%)`,
        }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
