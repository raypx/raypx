import { useTranslations } from "../i18n.js";
import { publicConfigurationQuery } from "../features/config/client.js";
import {
  accountAccessQuery,
  canAccessWebPage,
  webPages,
  type WebPath,
} from "../features/auth/access.js";
import { PermissionBoundary } from "../features/auth/components/permission-boundary.js";
import { analytics } from "../features/analytics/client.js";
import { AnalyticsIdentity } from "@raypx/analytics/client";
import { useEffect, useRef, useState } from "react";
import { UserButton } from "./user-button.js";
import { authClient } from "../features/auth/client.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  useMatches,
  useRouter,
  type StaticDataRouteOption,
} from "@tanstack/react-router";
import { SearchIcon } from "@raypx/icons/search";
import { useCommandShortcut } from "@raypx/blocks/command-palette";
import { WebCommandMenu } from "./command-menu.js";
import { SettingsIcon } from "@raypx/icons/settings";
import { AdjustmentsIcon } from "@raypx/icons/adjustments";
import { BookOpenIcon } from "@raypx/icons/book-open";
import { AgentIcon } from "@raypx/icons/agent";
import {
  AppShell,
  type ShellAction,
  type ShellLinkProps,
  type ShellNavItem,
} from "@raypx/blocks/shell";
import { IconButton } from "@raypx/ui/icon-button";

import { QuickSettingsModal } from "../features/settings/quick-settings-modal.js";
import { useQuickSettingsStore } from "../features/settings/quick-settings-store.js";

function ShellLink({ to, markActive, exact, ...props }: ShellLinkProps<WebPath | "/">) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: exact ?? false }}
      activeProps={markActive ? { "aria-current": "page" } : {}}
      {...props}
    />
  );
}

export function WebShell() {
  const session = authClient.useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const accountId = session.error || session.isPending ? null : (session.data?.user.id ?? null);
  const previousAccount = useRef(accountId);
  const accessQuery = useQuery(accountAccessQuery(accountId));
  const access =
    !accessQuery.isError && accessQuery.data?.accountId === accountId
      ? accessQuery.data
      : undefined;
  const site = useQuery(publicConfigurationQuery());
  const siteName = site.data?.siteName ?? "Raypx";
  const { openModal } = useQuickSettingsStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const shortcut = useCommandShortcut();

  useEffect(() => {
    if (previousAccount.current !== accountId) {
      previousAccount.current = accountId;
      queryClient.removeQueries({ queryKey: ["account"] });
      if (accountId) void router.invalidate();
    }
  }, [accountId, queryClient, router]);
  const t = useTranslations();
  const c = useTranslations("common");
  const memory = useTranslations("memory");
  const pathname = useMatches({ select: (matches) => matches.at(-1)?.fullPath ?? "/" });
  const pagePermission = Object.hasOwn(webPages, pathname)
    ? webPages[pathname as WebPath].permission
    : null;
  const page = useMatches({
    select: (matches) =>
      matches.reduce<StaticDataRouteOption["page"]>(
        (found, match) => match.staticData.page ?? found,
        undefined,
      ),
  });
  const navigation: ShellNavItem<WebPath>[] = [
    { to: "/agents", label: t("agents.title"), icon: <AgentIcon /> },
    { to: "/memory", label: memory("title"), icon: <BookOpenIcon /> },
  ];
  const secondaryNavigation: ShellNavItem<WebPath>[] = [
    { to: "/admin", label: t("dash.nav.console"), icon: <AdjustmentsIcon /> },
  ];
  const pages = [...navigation, ...secondaryNavigation].filter((item) =>
    canAccessWebPage(access, item.to),
  );
  const actions: ShellAction[] = [
    {
      label: c("search"),
      icon: <SearchIcon />,
      shortcut,
      onSelect: () => setSearchOpen(true),
    },
  ];
  return (
    <>
      <AnalyticsIdentity client={analytics} accountId={accountId} />
      <AppShell
        brand={{ to: "/agents", label: siteName }}
        actions={actions}
        navigation={[navigation.filter((item) => canAccessWebPage(access, item.to))]}
        secondaryNavigation={secondaryNavigation.filter((item) =>
          canAccessWebPage(access, item.to),
        )}
        breadcrumbs={[]}
        layout={page?.layout ?? "document"}
        LinkComponent={ShellLink}
        accountAction={
          <IconButton label={c("settings")} size="icon-lg" onClick={openModal}>
            <SettingsIcon aria-hidden="true" />
          </IconButton>
        }
        account={<UserButton variant="sidebar" />}
      >
        {accountId && pagePermission ? (
          <PermissionBoundary key={accountId} accountId={accountId} permission={pagePermission}>
            <Outlet />
          </PermissionBoundary>
        ) : (
          <Outlet />
        )}
      </AppShell>
      <QuickSettingsModal />
      <WebCommandMenu
        open={searchOpen}
        onOpenChange={setSearchOpen}
        pages={pages}
        onSettings={openModal}
      />
    </>
  );
}
