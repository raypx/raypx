import { useEffect, useRef } from "react";
import { AccountMenu } from "@raypx/account/client";
import { hasPermission } from "@raypx/account/access";
import { useAuthActions } from "@raypx/auth/hooks";
import { useTranslations } from "@raypx/i18n/browser";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClientOnly, useRouter, useRouterState } from "@tanstack/react-router";
import { DropdownMenuItem } from "@raypx/ui/components/ui/dropdown-menu";
import { Skeleton } from "@raypx/ui/components/ui/skeleton";
import { IconButton } from "@raypx/ui/icon-button";
import { SettingsIcon } from "@raypx/icons/settings";
import { UserCircleIcon } from "@raypx/icons/user-circle";
import { AdjustmentsIcon } from "@raypx/icons/adjustments";
import { RefreshIcon } from "@raypx/icons/refresh";
import { authClient, apiUrl, webUrl } from "../features/auth/client";
import { accountAccessQuery } from "../features/auth/access";
import { guestReturnTo } from "../features/tasks/guest-draft";
import { analytics } from "../features/analytics/client";

/** Landing content stays independent of account availability and SSR cookies. */
export function UserButton({ variant = "header" }: { variant?: "header" | "sidebar" }) {
  return variant === "header" ? (
    <ClientOnly fallback={<Skeleton className="size-10 rounded-full" />}>
      <AccountButton variant={variant} />
    </ClientOnly>
  ) : (
    <AccountButton variant={variant} />
  );
}

function AccountButton({ variant }: { variant: "header" | "sidebar" }) {
  const session = authClient.useSession();
  const accountId = session.error || session.isPending ? null : (session.data?.user.id ?? null);
  const previous = useRef(accountId);
  const router = useRouter();
  const href = useRouterState({ select: (state) => state.location.href });
  const cache = useQueryClient();
  const accessQuery = useQuery(accountAccessQuery(accountId));
  const access =
    !accessQuery.isError && accessQuery.data?.accountId === accountId
      ? accessQuery.data
      : undefined;
  const c = useTranslations("common");
  const auth = useAuthActions({ client: authClient, webUrl });
  useEffect(() => {
    if (previous.current !== accountId) {
      previous.current = accountId;
      cache.removeQueries({ queryKey: ["account"] });
      cache.removeQueries({ queryKey: ["admin-users"] });
    }
  }, [accountId, cache]);
  if (session.isPending)
    return (
      <Skeleton
        aria-label={c("loading")}
        className={variant === "header" ? "size-10 rounded-full" : "h-12 w-full rounded-lg"}
      />
    );
  if (session.error)
    return (
      <IconButton label={c("retryAccount")} onClick={() => void session.refetch()}>
        <RefreshIcon aria-hidden="true" />
      </IconButton>
    );
  return (
    <AccountMenu
      key={accountId ?? "guest"}
      variant={variant}
      user={session.data?.user ?? null}
      pending={false}
      busy={auth.busy}
      error={Boolean(auth.error)}
      onNavigate={(destination) => {
        if (destination === "account" && accountId) {
          if (!href.startsWith("/account"))
            void router.navigate({ to: "/account", state: { settingsReturnTo: href } });
        } else {
          void router.navigate({ to: "/login", search: { returnTo: guestReturnTo(apiUrl, href) } });
        }
      }}
      onSignOut={async () => {
        const result = await auth.signOut(async () => {
          analytics.reset();
          cache.clear();
          await router.navigate({ to: "/" });
          await router.invalidate();
        });
        return result.status === "success";
      }}
    >
      <DropdownMenuItem onClick={() => void router.navigate({ to: "/settings" })}>
        <SettingsIcon />
        {c("settings")}
      </DropdownMenuItem>
      {hasPermission(access, "users.read") && (
        <DropdownMenuItem onClick={() => void router.navigate({ to: "/admin/users" })}>
          <UserCircleIcon />
          {c("users")}
        </DropdownMenuItem>
      )}
      {hasPermission(access, "configuration.read") && (
        <DropdownMenuItem onClick={() => void router.navigate({ to: "/admin/settings" })}>
          <AdjustmentsIcon />
          {c("adminSettings")}
        </DropdownMenuItem>
      )}
    </AccountMenu>
  );
}
