import { selectCloudSnapshot } from "./cloud/source";
import type { Formatter } from "@voidmix/i18n";
export type { CloudDevice, CloudSnapshot, SyncJob } from "./cloud/types";

export function formatBytes(value: number, formatter?: Pick<Formatter, "number">): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const result = value / 1024 ** exponent;
  const digits = result >= 100 || exponent === 0 ? 0 : 1;
  const formatted = formatter
    ? formatter.number(Number(result.toFixed(digits)))
    : result.toFixed(digits);
  return `${formatted} ${units[exponent]}`;
}

export const loadCloudSnapshot = selectCloudSnapshot;
