import type { ReactNode } from "react";
import { cn } from "./lib/utils";

export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
