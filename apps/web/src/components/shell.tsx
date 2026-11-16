import { ShellSkipLink } from "@raypx/blocks/shell";
import { WebWorkspace } from "./workspace.js";
import type { WorkspaceSidebarSlots } from "@raypx/blocks/shell";
import { parseAgentSelection } from "@raypx/agents/model";
import type { ReactNode } from "react";
import { SetupChecklist } from "@raypx/account/client";
import { useSettingsNavigation } from "../features/settings/navigation.js";
import { VerificationPrompt } from "../features/auth/components/mail-state.js";
import { useTranslations } from "../i18n.js";
import { publicConfigurationQuery, setupChecklistPort } from "../features/config/client.js";
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
import { authClient, apiOrigin } from "../features/auth/client.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useLinkProps,
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
import { FileTextIcon } from "@raypx/icons/file-text";
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

function ShellLink({
  to,
  markActive,
  activeRoute,
  exact,
  spaceId,
  ...props
}: ShellLinkProps<WebPath | "/">) {
  const link = useLinkProps({
    to,
    search: to === "/pages" || to === "/agents" ? parseAgentSelection({ spaceId }) : {},
    activeOptions: { exact: exact ?? false, includeSearch: false },
    ...props,
  });
  const current = activeRoute === undefined ? link["aria-current"] : undefined;
  const active = activeRoute === undefined ? current === "page" : activeRoute === to;
  return (
    <a {...link} aria-current={markActive && active ? "page" : undefined}>
      {props.children}
    </a>
  );
}

export function WebShell() {
  const session = authClient.useSession();
  const settings = useSettingsNavigation();
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
    { to: "/pages", label: t("pages.title"), icon: <FileTextIcon /> },
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
  function renderShell(
    sidebar: WorkspaceSidebarSlots | undefined,
    content: ReactNode = <Outlet />,
  ) {
    return (
      <AppShell
        sidebar={sidebar}
        reserveWorkspaceSidebar
        skipLink={false}
        brand={{ to: "/agents", label: siteName }}
        actions={actions}
        navigation={[
          navigation.filter((item) => item.to !== "/agents" && canAccessWebPage(access, item.to)),
        ]}
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
        notice={
          accountId ? (
            <SetupChecklist
              destinations={{
                model: "#settings/models",
                sandbox: "/admin/settings#sandbox",
                mail: "/admin/settings#email",
              }}
              port={setupChecklistPort}
              origin={apiOrigin()}
              accountId={accountId}
              onConfigure={(item) => {
                if (item === "model") {
                  void settings.open("models");
                  return;
                }
                void router.navigate({
                  to: "/admin/settings",
                  hash: item === "mail" ? "email" : "sandbox",
                });
              }}
            />
          ) : undefined
        }
      >
        {accountId && pagePermission ? (
          <PermissionBoundary key={accountId} accountId={accountId} permission={pagePermission}>
            <VerificationPrompt key={accountId} />
            {content}
          </PermissionBoundary>
        ) : (
          <>
            <VerificationPrompt key={accountId} />
            {content}
          </>
        )}
      </AppShell>
    );
  }
  return (
    <>
      <ShellSkipLink />
      <AnalyticsIdentity client={analytics} accountId={accountId} />
      {accountId || session.isPending || session.error ? (
        <WebWorkspace
          key={`${apiOrigin()}:${accountId}`}
          accountId={accountId ?? ""}
          renderShell={renderShell}
        />
      ) : (
        renderShell(undefined)
      )}
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
