import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";

export interface SwitchProps extends ComponentProps<typeof BaseSwitch.Root> {
  size?: "default" | "sm";
}

function Switch({ className, size = "default", ...props }: SwitchProps) {
  return (
    <BaseSwitch.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input p-0.5 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-checked:bg-primary",
        size === "sm" ? "h-5 w-9" : "h-6 w-11",
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb
        className={cn(
          "pointer-events-none block rounded-full bg-background shadow-sm transition-transform data-checked:translate-x-full",
          size === "sm" ? "size-4" : "size-5",
        )}
      />
    </BaseSwitch.Root>
  );
}

export { Switch };
