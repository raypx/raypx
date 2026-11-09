import { Input as InputPrimitive } from "@base-ui/react/input";
import type { ComponentProps } from "react";

import { cn } from "#lib/utils";
import { controlSizeVariants, type ControlSize } from "../../control-size.ts";

export interface InputProps extends ComponentProps<"input"> {
  controlSize?: ControlSize;
}

function Input({ className, type, controlSize = "default", ...props }: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-size={controlSize}
      className={cn(
        "w-full min-w-0 border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-control-xs file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        controlSizeVariants({ size: controlSize }),
        controlSize === "sm" && "md:text-xs",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
