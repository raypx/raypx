import type { Formatter } from "@voidmix/i18n";
import type { WebTranslator } from "../../../i18n/client";
import type { AdminLastActive, UserRole, UserStatus } from "./types";

export function formatAdminRole(role: UserRole, translate: WebTranslator<"admin">): string {
  return role === "user"
    ? translate("member")
    : role === "owner"
      ? translate("owner")
      : translate("admin");
}

export function formatAdminStatus(status: UserStatus, translate: WebTranslator<"admin">): string {
  return translate(status === "active" ? "active" : "suspended");
}

/** Format the small set of preview/API activity values at the locale boundary. */
export function formatAdminLastActive(
  value: AdminLastActive,
  translate: (key: "connected" | "notAvailable") => string,
  formatter: Formatter,
): string {
  if (value.kind === "unknown") return translate("notAvailable");
  return value.kind === "connected"
    ? translate("connected")
    : formatter.relativeTime(value.value, value.unit, "numeric");
}

export function formatAdminJoinedAt(
  value: Date | null,
  formatter: Formatter,
  fallback: string,
): string {
  return value && Number.isFinite(value.valueOf()) ? formatter.dateTime(value, "short") : fallback;
}
