import { loadAccountAccess } from "./account-access";
import { hasPermission, type AccountAccess, type AccountPermission } from "@raypx/account/access";
import { apiUrl } from "./client";

/** One account-scoped read feeds menu visibility and direct page access. */
export function accountAccessQuery(accountId: string | null) {
  return {
    queryKey: ["account-access", apiUrl, accountId],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      loadAccountAccess(AbortSignal.any([signal, AbortSignal.timeout(10_000)])),
    enabled: Boolean(accountId),
    retry: false,
    staleTime: 0,
    refetchInterval: 30_000,
  };
}

/** Guest browsing, private feature access and navigation share one policy. */
export const webPages = {
  "/projects": { permission: "projects.read", guest: true, publicNavigation: true },
  "/settings": { permission: null, guest: true, publicNavigation: true },
  "/account": { permission: "account.manage", guest: true, publicNavigation: false },
  "/tasks": { permission: "tasks.read", guest: true, publicNavigation: false },
  "/approvals": { permission: "approvals.read", guest: true, publicNavigation: false },
  "/automations": { permission: "automations.manage", guest: true, publicNavigation: false },
  "/memory": { permission: "memory.manage", guest: true, publicNavigation: false },
  "/admin/users": { permission: "users.read", guest: false, publicNavigation: false },
  "/admin/settings": { permission: "configuration.read", guest: false, publicNavigation: false },
} as const satisfies Record<
  string,
  { permission: AccountPermission | null; guest: boolean; publicNavigation: boolean }
>;
export type WebPath = keyof typeof webPages;

export function canAccessWebPage(access: AccountAccess | undefined, path: WebPath): boolean {
  const policy = webPages[path];
  return (
    policy.publicNavigation ||
    (policy.permission !== null && hasPermission(access, policy.permission))
  );
}
