import type { ComponentPropsWithoutRef } from "react";

import markUrl from "./assets/voidmix-mark.webp?url";
import { cn } from "./lib/utils";

export interface LogoProps extends ComponentPropsWithoutRef<"span"> {
  label?: string;
}

export function Logo({ label = "Voidmix", className, ...props }: LogoProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}
      data-slot="logo"
      {...props}
    >
      <img
        alt=""
        aria-hidden="true"
        className="size-7 shrink-0 object-contain"
        data-slot="logo-mark"
        height={28}
        src={markUrl}
        width={28}
      />
      <span>{label}</span>
    </span>
  );
}
