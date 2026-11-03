import { publicConfigurationQuery } from "../features/configuration/client";
import {
  accountAccessQuery,
  canAccessWebPage,
  webPages,
  type WebPath,
} from "../features/auth/access";
import { hasPermission } from "@raypx/account/access";
import { PermissionBoundary } from "../features/auth/components/permission-boundary";
import { analytics } from "../features/analytics/client";
import { AnalyticsIdentity } from "@raypx/analytics/client";
import { useEffect, useRef } from "react";
import { PendingCount } from "@raypx/tasks/client/pending-count";
import { UserButton } from "./user-button";
import { authClient } from "../features/auth/client";
import { taskClient } from "../features/tasks/client";
import { RemoteProjectNavigation } from "../features/tasks/project-navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  useMatches,
  useRouter,
  type StaticDataRouteOption,
} from "@tanstack/react-router";
import { FolderOpenIcon } from "@raypx/icons/folder-open";
import { InboxIcon } from "@raypx/icons/inbox";
import { SettingsIcon } from "@raypx/icons/settings";
import { AdjustmentsIcon } from "@raypx/icons/adjustments";
import { ScheduleIcon } from "@raypx/icons/schedule";
import { BookOpenIcon } from "@raypx/icons/book-open";
import { AppShell, type ShellLinkProps, type ShellNavItem } from "@raypx/blocks/shell";
import { Tooltip, TooltipContent, TooltipTrigger } from "@raypx/ui/components/ui/tooltip";
import { useTranslations } from "@raypx/i18n/browser";
import { QuickSettingsModal } from "../features/settings/quick-settings-modal";
import { useQuickSettingsStore } from "../features/settings/quick-settings-store";

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

  useEffect(() => {
    taskClient.setAccount?.(accountId);
    if (previousAccount.current !== accountId) {
      previousAccount.current = accountId;
      queryClient.removeQueries({ queryKey: ["account"] });
      void router.invalidate();
    }
    return () => taskClient.setAccount?.(null);
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
    { to: "/projects", label: c("projects"), icon: <FolderOpenIcon />, exact: true },
    {
      to: "/approvals",
      label: c("approvals"),
      icon: <InboxIcon />,
      badge:
        accountId && hasPermission(access, "approvals.read") ? (
          <PendingCount key={accountId ?? "signed-out"} client={taskClient} accountId={accountId} />
        ) : undefined,
    },
  ];
  const secondaryNavigation: ShellNavItem<WebPath>[] = [
    { to: "/automations", label: c("jobs"), icon: <ScheduleIcon /> },
    { to: "/memory", label: memory("title"), icon: <BookOpenIcon /> },
  ];
  secondaryNavigation.push({ to: "/admin", label: c("adminConsole"), icon: <AdjustmentsIcon /> });
  return (
    <>
      <AnalyticsIdentity client={analytics} accountId={accountId} />
      <AppShell
        brand={{ to: "/", label: siteName }}
        navigation={[navigation.filter((item) => canAccessWebPage(access, item.to))]}
        navigationLabels={[c("workspace")]}
        contextNavigation={
          accountId && hasPermission(access, "projects.read") ? (
            <RemoteProjectNavigation key={accountId} accountId={accountId} />
          ) : undefined
        }
        secondaryNavigation={secondaryNavigation.filter((item) =>
          canAccessWebPage(access, item.to),
        )}
        breadcrumbs={page ? [t(!accountId && page.guestTitle ? page.guestTitle : page.title)] : []}
        layout={page?.layout ?? "document"}
        LinkComponent={ShellLink}
        accountAction={
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={c("settings")}
                  onClick={openModal}
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                />
              }
            >
              <SettingsIcon aria-hidden="true" className="size-5 stroke-[1.75]" />
            </TooltipTrigger>
            <TooltipContent side="top">{c("settings")}</TooltipContent>
          </Tooltip>
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
    </>
  );
}
