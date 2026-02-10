import { cn } from "@raypx/ui/lib/utils";
import type { ReactNode } from "react";

interface PageWrapperProps {
  children: ReactNode;
  className?: string;
  spacing?: "sm" | "md" | "lg";
}

const spacingMap = {
  sm: "space-y-4",
  md: "space-y-6",
  lg: "space-y-8",
};

export function PageWrapper({ children, className, spacing = "md" }: PageWrapperProps) {
  return (
    <div
      className={cn(
        "fade-in slide-in-from-bottom-4 w-full animate-in duration-500",
        spacingMap[spacing],
        className,
      )}
    >
      {children}
    </div>
  );
}
