import { styledSlot } from "#lib/styled-slot";
import type { ComponentProps, MouseEvent } from "react";

import { cn } from "#lib/utils";
import { Input } from "./input";

export type InputGroupAddonAlign = "inline-start" | "inline-end" | "block-start" | "block-end";

function InputGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        "group/input-group relative flex h-8 w-full min-w-0 items-center rounded-lg border border-input transition-colors outline-none has-disabled:bg-input/50 has-disabled:opacity-50 has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-3 has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col dark:bg-input/30 dark:has-disabled:bg-input/80 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupAddon({
  align = "inline-start",
  className,
  onClick,
  ...props
}: ComponentProps<"div"> & { align?: InputGroupAddonAlign }) {
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    onClick?.(event);
    if (event.defaultPrevented || (event.target as HTMLElement).closest("button")) return;
    event.currentTarget.parentElement?.querySelector("input")?.focus();
  }

  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 [&>svg:not([class*='size-'])]:size-4",
        align === "inline-start" && "order-first pl-2",
        align === "inline-end" && "order-last pr-1.5",
        align === "block-start" && "order-first w-full justify-start px-2.5 pt-2",
        align === "block-end" && "order-last w-full justify-start px-2.5 pb-2",
        className,
      )}
      onClick={handleClick}
      {...props}
    />
  );
}

const InputGroupInput = styledSlot(
  Input,
  "input-group-control",
  "flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent",
);

export { InputGroup, InputGroupAddon, InputGroupInput };
