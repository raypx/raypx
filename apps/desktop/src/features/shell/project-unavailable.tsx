import { EmptyState } from "@voidmix/ui/empty-state";
import { useDesktopTranslations } from "../../i18n/client";
import type { ProjectLoadFailure } from "../../lib/projects";
import { RefreshButton } from "./route-state";

export function ProjectUnavailable({
  result,
  routeId,
}: {
  result: ProjectLoadFailure;
  routeId: string;
}) {
  const t = useDesktopTranslations("projects");
  const reason = result.reason ?? "unavailable";
  return (
    <EmptyState
      title={t(reason)}
      description={t(`${reason}Description`)}
      action={<RefreshButton routeId={routeId} />}
    />
  );
}
