import { styledSlot } from "#lib/styled-slot";
import * as React from "react";

import { cn } from "#lib/utils";

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className,
      )}
      {...props}
    />
  );
}

const CardHeader = styledSlot(
  "div",
  "card-header",
  "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
);

const CardDescription = styledSlot("div", "card-description", "text-sm text-muted-foreground");

const CardContent = styledSlot("div", "card-content", "px-(--card-spacing)");

const CardFooter = styledSlot(
  "div",
  "card-footer",
  "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
);

export { Card, CardHeader, CardFooter, CardDescription, CardContent };
