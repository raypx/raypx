import { desktopAuthorizationPath, desktopOAuthQuerySchema } from "@raypx/contracts/api";
import { resumablePath } from "@raypx/core/auth";

const allowedReturnPaths = new Set([
  "/",
  "/projects",
  desktopAuthorizationPath,
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
  const path = resumablePath(value, allowedReturnPaths);
  if (path.split(/[?#]/, 1)[0] !== desktopAuthorizationPath) return path;
  const search = new URLSearchParams(path.split("?", 2)[1]?.split("#", 1)[0]);
  const oauth = desktopOAuthQuerySchema.safeParse(search.get("oauth"));
  if (!oauth.success) return "/";
  return `${desktopAuthorizationPath}?${new URLSearchParams({ oauth: oauth.data })}`;
}
