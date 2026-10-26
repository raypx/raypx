import {
  configurationAccessQuery,
  publicConfigurationQuery,
} from "../features/configuration/client";
import { analytics } from "../features/analytics/client";
import { AnalyticsIdentity } from "@raypx/analytics/client";
import { guestReturnTo } from "../features/tasks/guest-draft";
import { useEffect, useRef } from "react";
import { PendingCount } from "@raypx/tasks/client/pending-count";
import { AccountMenu } from "@raypx/account/client";
import { useAuthActions } from "@raypx/auth/hooks";
import { apiUrl, authClient, webUrl } from "../features/auth/client";
import { taskClient } from "../features/tasks/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import {
  ListTodo,
  Inbox,
  Settings,
  CircleUserRound,
  SlidersHorizontal,
  CalendarClock,
  BookOpen,
} from "lucide-react";
import { AppShell, type ShellLinkProps, type ShellNavItem } from "@raypx/blocks/shell";
import { useTranslations } from "@raypx/i18n/browser";

type WebPath =
  | "/"
  | "/settings"
  | "/tasks"
  | "/approvals"
  | "/automations"
  | "/memory"
  | "/admin/settings";

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
  const accountId = session.error ? null : (session.data?.user.id ?? null);
  const previousAccount = useRef(accountId);
  const access = useQuery(configurationAccessQuery(accountId));
  const site = useQuery(publicConfigurationQuery());
  const siteName = site.data?.siteName ?? "Raypx";
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
  const c = useTranslations("common");
  const g = useTranslations("guest");
  const memory = useTranslations("memory");
  const href = useRouterState({ select: (state) => state.location.href });
  const path = useRouterState({ select: (state) => state.location.pathname });
  const navigation: ShellNavItem<WebPath>[] = [
    { to: "/tasks", label: c("tasks"), icon: <ListTodo /> },
    { to: "/automations", label: c("jobs"), icon: <CalendarClock /> },
    { to: "/memory", label: memory("title"), icon: <BookOpen /> },
    {
      to: "/approvals",
      label: c("approvals"),
      icon: <Inbox />,
      badge: accountId ? (
        <PendingCount key={accountId ?? "signed-out"} client={taskClient} accountId={accountId} />
      ) : undefined,
    },
  ];
  const secondaryNavigation: ShellNavItem<WebPath>[] = [
    { to: "/", label: c(accountId ? "account" : "home"), icon: <CircleUserRound />, exact: true },
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
          path.startsWith("/memory")
            ? memory("title")
            : c(
                path.startsWith("/admin/")
                  ? "adminSettings"
                  : path.startsWith("/tasks")
                    ? "tasks"
                    : path.startsWith("/automations")
                      ? "jobs"
                      : path.startsWith("/approvals")
                        ? "approvals"
                        : path === "/settings"
                          ? "settings"
                          : accountId
                            ? "account"
                            : "home",
              ),
        ]}
        LinkComponent={ShellLink}
        notice={
          !session.isPending && !session.error && !accountId ? (
            <p className="shrink-0 border-b border-border bg-sidebar px-6 py-2.5 text-xs leading-relaxed text-muted-foreground max-[760px]:px-5">
              {g("visitorNotice")}
            </p>
          ) : undefined
        }
        account={
          <AccountMenu
            key={accountId ?? "signed-out"}
            user={accountId ? (session.data?.user ?? null) : null}
            pending={session.isPending}
            busy={auth.busy}
            error={Boolean(auth.error)}
            onNavigate={(destination) => {
              if (destination === "login" || (destination === "account" && !accountId))
                void router.navigate({
                  to: "/login",
                  search: {
                    returnTo: guestReturnTo(apiUrl, destination === "account" ? "/" : href),
                  },
                });
              else void router.navigate({ to: destination === "account" ? "/" : "/settings" });
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
        <Outlet />
      </AppShell>
    </>
  );
}
