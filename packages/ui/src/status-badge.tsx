import { Circle, CircleAlert, CircleCheck, Info, type LucideIcon } from "lucide-react";

import { Badge, type BadgeProps } from "./components/ui/badge";
import { cn } from "./lib/utils";

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

export interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  className?: string;
}

const toneConfig: Record<
  StatusTone,
  { icon: LucideIcon; variant: NonNullable<BadgeProps["variant"]> }
> = {
  neutral: { icon: Circle, variant: "outline" },
  info: { icon: Info, variant: "secondary" },
  warning: { icon: CircleAlert, variant: "secondary" },
  success: { icon: CircleCheck, variant: "secondary" },
  danger: { icon: CircleAlert, variant: "destructive" },
};

export function StatusBadge({ label, tone = "neutral", className }: StatusBadgeProps) {
  const config = toneConfig[tone];
  const Icon = config.icon;

  return (
    <Badge className={cn("shrink-0", className)} variant={config.variant}>
      <Icon aria-hidden="true" data-icon="inline-start" strokeWidth={2.5} />
      {label}
    </Badge>
  );
}
