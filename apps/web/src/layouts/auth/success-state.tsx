import { cn } from "@raypx/ui/lib/utils";
import { CheckCircle2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface SuccessStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string | ReactNode;
  children?: ReactNode;
  className?: string;
}

export function SuccessState({
  icon: Icon = CheckCircle2,
  title,
  description,
  children,
  className,
}: SuccessStateProps) {
  return (
    <div className={cn("grid w-full gap-6 text-center", className)}>
      <div className="flex flex-col items-center justify-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 ring-8 ring-green-50 dark:ring-green-900/10">
          <Icon className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
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
