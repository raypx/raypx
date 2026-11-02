import { publicConfigurationQuery } from "../features/configuration/client";
import {
  accountAccessQuery,
  canAccessWebPage,
  webPagePermissions,
  type WebPath,
} from "../features/auth/access";
import { hasPermission } from "@raypx/account/access";
import { PermissionBoundary } from "../features/auth/components/permission-boundary";
import { analytics } from "../features/analytics/client";
import { AnalyticsIdentity } from "@raypx/analytics/client";
import { guestReturnTo } from "../features/tasks/guest-draft";
import { useEffect, useRef, useState } from "react";
import { PendingCount } from "@raypx/tasks/client/pending-count";
import { AccountMenu } from "@raypx/account/client";
import { useAuthActions } from "@raypx/auth/hooks";
import { apiUrl, authClient, webUrl } from "../features/auth/client";
import { taskClient } from "../features/tasks/client";
import { RemoteProjectNavigation } from "../features/tasks/project-navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  useMatches,
  useRouter,
  useRouterState,
  type StaticDataRouteOption,
} from "@tanstack/react-router";
import {
  FolderOpen,
  Inbox,
  Settings,
  SlidersHorizontal,
  CalendarClock,
  BookOpen,
} from "lucide-react";
import { AppShell, type ShellLinkProps, type ShellNavItem } from "@raypx/blocks/shell";
import { Tooltip, TooltipContent, TooltipTrigger } from "@raypx/ui/components/ui/tooltip";
import { useTranslations } from "@raypx/i18n/browser";
import { QuickSettingsModal } from "../features/settings/quick-settings-modal";

function ShellLink({ to, markActive, exact, ...props }: ShellLinkProps<WebPath>) {
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
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);

  useEffect(() => {
    taskClient.setAccount?.(accountId);
    if (previousAccount.current !== accountId) {
      previousAccount.current = accountId;
      queryClient.removeQueries({ queryKey: ["account"] });
      void router.invalidate();
    }
    return () => taskClient.setAccount?.(null);
  }, [accountId, queryClient, router]);
  const auth = useAuthActions({ client: authClient, webUrl });
  const t = useTranslations();
  const c = useTranslations("common");
  const memory = useTranslations("memory");
  const href = useRouterState({ select: (state) => state.location.href });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const pagePermission = Object.hasOwn(webPagePermissions, pathname)
    ? webPagePermissions[pathname as WebPath]
    : null;
  const page = useMatches({
    select: (matches) =>
      matches.reduce<StaticDataRouteOption["page"]>(
        (found, match) => match.staticData.page ?? found,
        undefined,
      ),
  });
  const navigation: ShellNavItem<WebPath>[] = [
    { to: "/", label: c("projects"), icon: <FolderOpen />, exact: true },
    {
      to: "/approvals",
      label: c("approvals"),
      icon: <Inbox />,
      badge:
        accountId && hasPermission(access, "approvals.read") ? (
          <PendingCount key={accountId ?? "signed-out"} client={taskClient} accountId={accountId} />
        ) : undefined,
    },
  ];
  const secondaryNavigation: ShellNavItem<WebPath>[] = [
    { to: "/automations", label: c("jobs"), icon: <CalendarClock /> },
    { to: "/memory", label: memory("title"), icon: <BookOpen /> },
  ];
  secondaryNavigation.push({
    to: "/admin/settings",
    label: c("adminSettings"),
    icon: <SlidersHorizontal />,
  });
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
                  onClick={() => setQuickSettingsOpen(true)}
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                />
              }
            >
              <Settings aria-hidden="true" className="size-5 stroke-[1.75]" />
            </TooltipTrigger>
            <TooltipContent side="top">{c("settings")}</TooltipContent>
          </Tooltip>
        }
        account={
          <AccountMenu
            key={accountId ?? "signed-out"}
            user={accountId ? (session.data?.user ?? null) : null}
            pending={session.isPending}
            busy={auth.busy}
            error={Boolean(auth.error)}
            onNavigate={(destination) => {
              if (destination === "login" || !accountId)
                void router.navigate({
                  to: "/login",
                  search: {
                    returnTo: guestReturnTo(apiUrl, destination === "account" ? "/account" : href),
                  },
                });
              else void router.navigate({ to: "/account" });
            }}
            onSignOut={async () => {
              const result = await auth.signOut(async () => {
                analytics.reset();
                queryClient.clear();
                await router.invalidate();
                await router.navigate({ to: "/" });
              });
              return result.status === "success";
            }}
          />
        }
      >
        {accountId && pagePermission ? (
          <PermissionBoundary key={accountId} accountId={accountId} permission={pagePermission}>
            <Outlet />
          </PermissionBoundary>
        ) : (
          <Outlet />
        )}
      </AppShell>
      <QuickSettingsModal open={quickSettingsOpen} onOpenChange={setQuickSettingsOpen} />
    </>
  );
}
