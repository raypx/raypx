import { CircleAlert } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "../utils.js";

export interface ErrorStateProps extends Omit<ComponentProps<"section">, "title"> {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

/** Announce a recoverable failure; retry behavior remains with the caller. */
export function ErrorState({ title, description, action, className, ...props }: ErrorStateProps) {
  const titleId = useId();
  return (
    <section
      role="alert"
      aria-labelledby={titleId}
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-destructive/35 bg-destructive/5 p-6",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <CircleAlert aria-hidden="true" className="size-5 shrink-0 text-destructive" />
        <h3 id={titleId} className="text-base font-semibold">
          {title}
        </h3>
      </div>
      {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </section>
  );
}
