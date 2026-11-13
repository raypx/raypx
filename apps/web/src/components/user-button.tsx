import { useTranslations } from "../i18n.js";
import { useEffect, useRef } from "react";
import { AccountMenu } from "@raypx/account/client";
import { hasPermission } from "@raypx/account/access";
import { useAuthActions } from "@raypx/auth/hooks";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClientOnly, useRouter, useRouterState } from "@tanstack/react-router";
import { DropdownMenuItem } from "@raypx/ui/components/ui/dropdown-menu";
import { Skeleton } from "@raypx/ui/components/ui/skeleton";
import { IconButton } from "@raypx/ui/icon-button";
import { SettingsIcon } from "@raypx/icons/settings";
import { AdjustmentsIcon } from "@raypx/icons/adjustments";
import { RefreshIcon } from "@raypx/icons/refresh";
import { authClient, apiUrl, webUrl } from "../features/auth/client.js";
import { accountAccessQuery } from "../features/auth/access.js";
import { safeReturnTo } from "../features/auth/return-to.js";
import { analytics } from "../features/analytics/client.js";
import { AccountSettingsOverlay } from "../features/settings/overlay.js";
import { useSettingsNavigation } from "../features/settings/navigation.js";

const headerPlaceholderClass = "size-8 rounded-full";

/** Landing content stays independent of account availability and SSR cookies. */
export function UserButton({
  variant = "header",
  sessionError = "retry",
}: {
  variant?: "header" | "sidebar";
  /** Landing keeps the account control; shells retry the session check in place. */
  sessionError?: "retry" | "account";
}) {
  return variant === "header" ? (
    <ClientOnly fallback={<Skeleton className={headerPlaceholderClass} />}>
      <AccountButton variant={variant} sessionError={sessionError} />
      <AccountSettingsOverlay />
    </ClientOnly>
  ) : (
    <>
      <AccountButton variant={variant} sessionError={sessionError} />
      <ClientOnly fallback={null}>
        <AccountSettingsOverlay />
      </ClientOnly>
    </>
  );
}

function AccountButton({
  variant,
  sessionError,
}: {
  variant: "header" | "sidebar";
  sessionError: "retry" | "account";
}) {
  const session = authClient.useSession();
  const accountId = session.error || session.isPending ? null : (session.data?.user.id ?? null);
  const previous = useRef(accountId);
  const router = useRouter();
  const href = useRouterState({ select: (state) => state.location.href });
  const settings = useSettingsNavigation();
  const cache = useQueryClient();
  const accessQuery = useQuery(accountAccessQuery(accountId));
  const access =
    !accessQuery.isError && accessQuery.data?.accountId === accountId
      ? accessQuery.data
      : undefined;
  const c = useTranslations("common");
  const nav = useTranslations("dash.nav");
  const auth = useAuthActions({ client: authClient, webUrl });
  useEffect(() => {
    if (previous.current !== accountId) {
      const oldAccount = previous.current;
      previous.current = accountId;
      cache.removeQueries({ queryKey: ["account"], exact: true });
      if (oldAccount) {
        cache.removeQueries({ queryKey: ["account", apiUrl, oldAccount] });
        for (const key of ["admin-users", "admin-overview", "admin-health", "admin-audit"])
          cache.removeQueries({ queryKey: [key, apiUrl, oldAccount] });
      }
    }
  }, [accountId, cache]);
  if (session.isPending)
    return (
      <Skeleton
        aria-label={c("loading")}
        className={variant === "header" ? headerPlaceholderClass : "h-12 w-full rounded-lg"}
      />
    );
  if (session.error && sessionError === "retry")
    return (
      <IconButton
        label={c("retryAccount")}
        className={variant === "header" ? "size-8" : undefined}
        onClick={() => void session.refetch()}
      >
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
          void settings.open();
        } else {
          void router.navigate({
            to: "/login",
            search: { returnTo: href === "/" ? "/agents" : safeReturnTo(href) },
          });
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
      {hasPermission(access, "admin.read") && (
        <DropdownMenuItem onClick={() => void router.navigate({ to: "/admin" })}>
          <AdjustmentsIcon />
          {nav("console")}
        </DropdownMenuItem>
      )}
    </AccountMenu>
  );
}
