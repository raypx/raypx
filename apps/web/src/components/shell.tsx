import {
  configurationAccessQuery,
  publicConfigurationQuery,
} from "../features/configuration/client";
import { analytics } from "../features/analytics/client";
import { AnalyticsIdentity } from "@raypx/analytics/client";
import { useEffect } from "react";
import { PendingCount } from "@raypx/tasks/client/pending-count";
import { AccountMenu } from "@raypx/account/client";
import { useAuthActions } from "@raypx/auth/hooks";
import { authClient, webUrl } from "../features/auth/client";
import { taskClient } from "../features/tasks/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { ListTodo, Inbox, Settings, CircleUserRound, SlidersHorizontal } from "lucide-react";
import { AppShell, type ShellLinkProps, type ShellNavItem } from "@raypx/blocks/shell";
import { useTranslations } from "@raypx/i18n/browser";

type WebPath = "/" | "/settings" | "/tasks" | "/approvals" | "/admin/settings";

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
  const accountId = session.data?.user.id ?? null;
  const access = useQuery(configurationAccessQuery(accountId));
  const site = useQuery({ ...publicConfigurationQuery(), enabled: Boolean(accountId) });
  const siteName = site.data?.siteName ?? "Raypx";
  useEffect(() => {
    taskClient.setAccount?.(accountId);
    return () => taskClient.setAccount?.(null);
  }, [accountId]);
  const auth = useAuthActions({ client: authClient, webUrl });
  const c = useTranslations("common");
  const path = useRouterState({ select: (state) => state.location.pathname });
  const navigation: ShellNavItem<WebPath>[] = [
    { to: "/tasks", label: c("tasks"), icon: <ListTodo /> },
    {
      to: "/approvals",
      label: c("approvals"),
      icon: <Inbox />,
      badge: (
        <PendingCount key={accountId ?? "signed-out"} client={taskClient} accountId={accountId} />
      ),
    },
  ];
  const secondaryNavigation: ShellNavItem<WebPath>[] = [
    { to: "/", label: c("account"), icon: <CircleUserRound />, exact: true },
    { to: "/settings", label: c("settings"), icon: <Settings /> },
  ];
  if (access.data?.allowed)
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
        navigation={[navigation]}
        navigationLabels={[c("workspace")]}
        secondaryNavigation={secondaryNavigation}
        breadcrumbs={[
          siteName,
          c(
            path.startsWith("/admin/")
              ? "adminSettings"
              : path.startsWith("/tasks")
                ? "tasks"
                : path.startsWith("/approvals")
                  ? "approvals"
                  : path === "/settings"
                    ? "settings"
                    : "account",
          ),
        ]}
        LinkComponent={ShellLink}
        account={
          <AccountMenu
            key={accountId ?? "signed-out"}
            user={session.data?.user ?? null}
            pending={session.isPending}
            busy={auth.busy}
            error={Boolean(auth.error)}
            onNavigate={(destination) =>
              void router.navigate({ to: destination === "account" ? "/" : `/${destination}` })
            }
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
        <Outlet />
      </AppShell>
    </>
  );
}
