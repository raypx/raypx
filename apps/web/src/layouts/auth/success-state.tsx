import { cn } from "@raypx/ui/lib/utils";
import { IconCircleCheck } from "@tabler/icons-react";
import type { ReactNode } from "react";

interface SuccessStateProps {
  icon?: ReactNode;
  title: string;
  description?: string | ReactNode;
  children?: ReactNode;
  className?: string;
}

export function SuccessState({ icon, title, description, children, className }: SuccessStateProps) {
  return (
    <div className={cn("grid w-full gap-6 text-center", className)}>
      <div className="flex flex-col items-center justify-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 ring-8 ring-green-50 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-900/10">
          {icon || <IconCircleCheck className="h-8 w-8" />}
        </div>

        <div className="space-y-2">
          <h2 className="font-bold text-2xl tracking-tight">{title}</h2>
          {description && (
            <div className="text-muted-foreground">
              {typeof description === "string" ? <p>{description}</p> : description}
            </div>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
