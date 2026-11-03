import { createApiClient } from "@raypx/client/api";
import { hasPermission, type AccountAccess, type AccountPermission } from "@raypx/account/access";
import { apiUrl } from "./client";

const client = createApiClient({ baseUrl: apiUrl });

/** One account-scoped read feeds menu visibility and direct page access. */
export function accountAccessQuery(accountId: string | null) {
  return {
    queryKey: ["account-access", apiUrl, accountId],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      client.account.access({}, { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) }),
    enabled: Boolean(accountId),
    retry: false,
    staleTime: 0,
    refetchInterval: 30_000,
  };
}

/** Public pages stay public; private menu entries declare their capability here. */
export const webPagePermissions = {
  "/projects": null,
  "/settings": null,
  "/account": "account.manage",
  "/tasks": "tasks.read",
  "/approvals": "approvals.read",
  "/automations": "automations.manage",
  "/memory": "memory.manage",
  "/admin/settings": "configuration.read",
} as const satisfies Record<string, AccountPermission | null>;
export type WebPath = keyof typeof webPagePermissions;

export function canAccessWebPage(access: AccountAccess | undefined, path: WebPath): boolean {
  const permission = webPagePermissions[path];
  return permission === null || hasPermission(access, permission);
}
