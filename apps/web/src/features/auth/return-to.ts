import { resumablePath } from "@raypx/core/auth";

const allowedReturnPaths = new Set([
  "/",
  "/projects",
  "/tasks",
  "/approvals",
  "/automations",
  "/memory",
  "/settings",
  "/admin",
  "/admin/audit",
  "/admin/settings",
  "/admin/users",
]);

/** Only application pages may be resumed after authentication. Never execute an intent here. */
export function safeReturnTo(value: unknown): string {
  return resumablePath(value, allowedReturnPaths);
}
