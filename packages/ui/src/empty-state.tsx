import type { ReactNode } from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./components/ui/empty";
import { cn } from "./lib/utils";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("py-12", className)}>
      <EmptyHeader>
        {icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
        <EmptyTitle>
          <h2>{title}</h2>
        </EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
