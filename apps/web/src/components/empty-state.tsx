import { Button } from "@raypx/ui/components/button";
import type { TablerIcon } from "@raypx/ui/components/icon";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: TablerIcon;
  title: string;
  description: string;
  actionLabel?: ReactNode;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="px-6 py-12 text-center">
      <Icon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="mb-2 font-medium text-lg">{title}</h3>
      <p className="mb-4 text-muted-foreground text-sm">{description}</p>
      {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
