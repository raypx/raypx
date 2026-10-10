import { Inbox } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "../lib/utils.js";

export interface EmptyStateProps extends Omit<ComponentProps<"section">, "title"> {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}

/** Present an empty collection with context and an optional caller-owned action. */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
  ...props
}: EmptyStateProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center",
        className,
      )}
      {...props}
    >
      <div aria-hidden="true" className="text-muted-foreground [&_svg]:size-8">
        {icon ?? <Inbox />}
      </div>
      <h3 id={titleId} className="text-base font-semibold">
        {title}
      </h3>
      {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </section>
  );
}
