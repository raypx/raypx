import type { ApiClient } from "@voidmix/client";
type Project = Awaited<ReturnType<ApiClient["projects"]["get"]>>["project"];
import { StatusBadge, type StatusTone } from "@voidmix/ui/status-badge";
import { useTranslations } from "../../i18n/client";

const tones = {
  draft: "neutral",
  in_progress: "info",
  review: "info",
  delivered: "success",
} as const satisfies Record<Project["stage"], StatusTone>;

export function ProjectStatus({ stage }: { stage: Project["stage"] }) {
  const t = useTranslations("projects");
  const label = t(stage === "in_progress" ? "inProgress" : stage);
  return <StatusBadge label={label} tone={tones[stage]} />;
}
