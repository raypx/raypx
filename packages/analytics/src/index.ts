import type { AnalyticsConsent, AnalyticsProperties } from "@raypx-kit/analytics";
export type { AnalyticsClient, AnalyticsConsent } from "@raypx-kit/analytics";
export const ANALYTICS_PREFERENCE_KEY = "raypx_analytics";
export function parseAnalyticsConsent(value: unknown): AnalyticsConsent {
  if (!value || typeof value !== "object") return { usage: false, errors: false };
  const input = value as Record<string, unknown>;
  return { usage: input.usage === true, errors: input.errors === true };
}
export function isAnalyticsConsent(value: unknown): value is AnalyticsConsent {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).usage === "boolean" &&
    typeof (value as Record<string, unknown>).errors === "boolean",
  );
}
const pages = new Set([
  "account",
  "settings",
  "tasks",
  "approvals",
  "files",
  "jobs",
  "terminal",
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "verify-email",
]);
export function analyticsPage(path: string, surface: "web" | "desktop" = "web"): string {
  return path === "/"
    ? surface === "desktop"
      ? "files"
      : "account"
    : path === "/automations"
      ? "jobs"
      : pages.has(path.slice(1))
        ? path.slice(1)
        : "other";
}
const errorCodes = new Set([
  "AUTH_REQUIRED",
  "DEVICE_OFFLINE",
  "PROJECT_BUSY",
  "AGENT_UNAVAILABLE",
  "APPROVAL_EXPIRED",
  "IDEMPOTENCY_CONFLICT",
  "DEVICE_REVOKED",
  "SESSION_UNAVAILABLE",
  "RATE_LIMITED",
  "LOCAL_UNAVAILABLE",
  "NETWORK_UNAVAILABLE",
]);
export function analyticsCode(error: unknown): string {
  try {
    const value = error as { data?: { error?: { code?: unknown } }; code?: unknown };
    const code = value?.data?.error?.code ?? value?.code;
    return typeof code === "string" && errorCodes.has(code) ? code : "UNEXPECTED_ERROR";
  } catch {
    return "UNEXPECTED_ERROR";
  }
}
/** First query-key segments that may be reported; other reads become "other". */
const queries = new Set(["account", "tasks"]);
/** API request IDs; they identify a log line, never a person or a resource. */
const requestIdPattern = /^req_[a-z]{24}$/;
/** Reads the API request ID carried by an RPC error, if it has the expected shape. */
export function analyticsRequestId(error: unknown): string | undefined {
  try {
    const id = (error as { data?: { requestId?: unknown } })?.data?.requestId;
    return typeof id === "string" && requestIdPattern.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}
/** Explicit enum projection, also applied after PostHog adds default properties. */
export function eventPolicy(
  event: string,
  properties: AnalyticsProperties,
): AnalyticsProperties | null {
  switch (event) {
    case "app_opened":
    case "sign_in_succeeded":
      return {};
    case "page_viewed":
      return {
        page:
          typeof properties.page === "string" &&
          (pages.has(properties.page) || properties.page === "other")
            ? properties.page
            : "other",
      };
    case "query_failed":
      return {
        query:
          typeof properties.query === "string" && queries.has(properties.query)
            ? properties.query
            : "other",
        code:
          typeof properties.code === "string" && errorCodes.has(properties.code)
            ? properties.code
            : "UNEXPECTED_ERROR",
        ...(typeof properties.requestId === "string" && requestIdPattern.test(properties.requestId)
          ? { requestId: properties.requestId }
          : {}),
      };
    case "task_scope_changed":
      return { scope: properties.scope === "local" ? "local" : "remote" };
    case "task_create_result":
    case "approval_submit_result":
      return {
        scope: properties.scope === "local" ? "local" : "remote",
        outcome: properties.outcome === "accepted" ? "accepted" : "failed",
        ...(event === "task_create_result"
          ? { provider: properties.provider === "claude" ? "claude" : "codex" }
          : {}),
        ...(properties.outcome !== "accepted"
          ? {
              code:
                typeof properties.code === "string" && errorCodes.has(properties.code)
                  ? properties.code
                  : "UNEXPECTED_ERROR",
            }
          : {}),
      };
    default:
      return null;
  }
}
export interface AnalyticsPreferenceStore {
  read(): AnalyticsConsent | Promise<AnalyticsConsent>;
  write(value: AnalyticsConsent): Promise<boolean>;
  subscribe?: (refresh: () => void) => () => void;
}
