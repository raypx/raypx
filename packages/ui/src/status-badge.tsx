import { CircleIcon } from "@raypx/icons/circle";
import { AlertCircleIcon } from "@raypx/icons/alert-circle";
import { CheckCircleIcon } from "@raypx/icons/check-circle";
import { InfoIcon } from "@raypx/icons/info";
import type { IconComponent } from "@raypx/icons";

import { Badge, type BadgeProps } from "./components/ui/badge.js";
import { cn } from "./lib/utils.js";

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

export interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  className?: string;
}

const toneConfig: Record<
  StatusTone,
  { icon: IconComponent; variant: NonNullable<BadgeProps["variant"]> }
> = {
  neutral: { icon: CircleIcon, variant: "outline" },
  info: { icon: InfoIcon, variant: "secondary" },
  warning: { icon: AlertCircleIcon, variant: "secondary" },
  success: { icon: CheckCircleIcon, variant: "secondary" },
  danger: { icon: AlertCircleIcon, variant: "destructive" },
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
