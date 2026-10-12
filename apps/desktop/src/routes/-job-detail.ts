import type { Formatter } from "@voidmix/i18n";

import { formatBytes, type SyncJob } from "../lib/cloud";

type JobDetailKey = "jobFiles" | "jobFilesWithSize" | "jobObjects" | "jobObjectsWithSize";
type JobDetailTranslator = (key: JobDetailKey, values: Record<string, unknown>) => string;

export function formatJobDetail(
  detail: SyncJob["detail"],
  t: JobDetailTranslator,
  formatter: Pick<Formatter, "number">,
): string {
  if (detail.kind === "objects") {
    return detail.sizeBytes !== undefined
      ? t("jobObjectsWithSize", {
          count: detail.count,
          size: formatBytes(detail.sizeBytes, formatter),
        })
      : t("jobObjects", { count: detail.count });
  }
  return detail.sizeBytes !== undefined
    ? t("jobFilesWithSize", {
        count: detail.count,
        size: formatBytes(detail.sizeBytes, formatter),
      })
    : t("jobFiles", { count: detail.count });
}
