import type { ReactNode } from "react";
import { cn } from "./lib/utils";

/** A compact, neutral heading row for sections inside a page. */
export function SectionHeading({
  title,
  titleId,
  description,
  action,
  className,
}: {
  title: string;
  titleId?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 id={titleId} className="text-sm font-medium">
          {title}
        </h2>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
