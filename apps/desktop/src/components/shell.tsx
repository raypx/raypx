import { analytics } from "../features/analytics/client";
import { AnalyticsIdentity } from "@raypx/analytics/client";
import { PendingCount } from "@raypx/tasks/client/pending-count";
import { useQueryClient } from "@tanstack/react-query";
import { AccountMenu } from "@raypx/account/client";
import { useAuthActions } from "@raypx/auth/hooks";
import { authClient, webUrl } from "../features/auth/client";
import { taskClient } from "../features/tasks/client";
import { signOutDesktopHost } from "../features/tasks/host-session";
import { TerminalRequestNotice } from "../features/tasks/request-notice";
import { ProjectNavigation } from "../features/tasks/project-navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@raypx/ui/components/ui/tooltip";
import {
  createPendingClient,
  localTaskClient,
  accountLocalTaskClient,
} from "../features/tasks/local-client";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { desktopReturnTo } from "../features/auth/return-to";
import { useEffect, useState } from "react";
import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import {
  CalendarClock,
  FolderOpen,
  ListTodo,
  Inbox,
  Settings,
  SquareTerminal,
  BookOpen,
} from "lucide-react";
import { AppShell, type ShellLinkProps } from "@raypx/blocks/shell";
import { EngineNotice } from "../features/engine/notice";
import { useTranslations } from "@raypx/i18n/browser";
import { getDesktopRuntime, isDesktop, onLocalEvent, restartEngine } from "../lib/desktop";

const pendingClient = createPendingClient(
  createPendingClient(localTaskClient, accountLocalTaskClient),
  taskClient,
);

type DesktopPath =
  | "/"
  | "/automations"
  | "/memory"
  | "/terminal"
  | "/account"
  | "/settings"
  | "/tasks"
  | "/approvals";

function ShellLink({ to, markActive, exact, ...props }: ShellLinkProps<DesktopPath>) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: exact ?? false }}
      activeProps={markActive ? { "aria-current": "page" } : {}}
      {...props}
    />
  );
}

/** Prerendered before device preferences are known, so it carries no translated text. */
export function ShellSkeleton() {
  return <div className="h-dvh min-h-dvh" aria-busy="true" />;
}

export function DesktopShell() {
  const session = authClient.useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const auth = useAuthActions({ client: authClient, webUrl });
  const path = useRouterState({ select: (state) => state.location.pathname });
  const href = useRouterState({ select: (state) => state.location.href });
  const c = useTranslations("common");
  const memory = useTranslations("memory");
  const [engine, setEngine] = useState("starting");
  const [engineCode, setEngineCode] = useState<string>();
  useEffect(() => {
    let active = true;
    void getDesktopRuntime()
      .then((runtime) => {
        if (active) {
          setEngine(runtime.engine.status);
          setEngineCode(runtime.engine.code);
        }
      })
      .catch(() => {
        if (active) setEngine("error");
      });
    const stop = onLocalEvent((event) => {
      if (event.event === "engine.status" && typeof event.data.status === "string") {
        setEngine(event.data.status);
        setEngineCode(typeof event.data.code === "string" ? event.data.code : undefined);
      }
      if (event.event === "approval.open")
        void router.navigate({
          to: "/approvals",
          search: { scope: event.data.scope === "remote" ? "remote" : "local" },
        });
    });
    return () => {
      active = false;
      stop();
    };
  }, [router]);
  const accountId = session.error || session.isPending ? null : (session.data?.user.id ?? null);
  return (
    <>
      <AnalyticsIdentity client={analytics} accountId={accountId} />
      <AppShell
        frame="window"
        brand={{ to: "/", label: "Raypx", description: c("deviceWorkspace") }}
        contextNavigation={<ProjectNavigation />}
        navigationLabels={[c("workspace"), c("localTools")]}
        navigation={[
          [
            {
              to: "/approvals",
              label: c("approvals"),
              icon: <Inbox />,
              badge: (
                <PendingCount
                  key={accountId ?? "signed-out"}
                  client={accountId ? pendingClient : localTaskClient}
                  accountId={accountId ?? LOCAL_WORKSPACE_ID}
                />
              ),
            },
            { to: "/tasks", label: c("tasks"), icon: <ListTodo /> },
            { to: "/memory", label: memory("title"), icon: <BookOpen /> },
          ],
          [
            { to: "/", label: c("files"), icon: <FolderOpen />, exact: true },
            { to: "/automations", label: c("jobs"), icon: <CalendarClock /> },
            { to: "/terminal", label: c("terminal"), icon: <SquareTerminal /> },
          ],
        ]}
        accountAction={
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  to="/settings"
                  aria-label={c("settings")}
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                />
              }
            >
              <Settings aria-hidden="true" className="size-5 stroke-[1.75]" />
            </TooltipTrigger>
            <TooltipContent side="top">{c("settings")}</TooltipContent>
          </Tooltip>
        }
        breadcrumbs={[
          "Raypx",
          path.startsWith("/memory")
            ? memory("title")
            : c(
                path.startsWith("/tasks")
                  ? "tasks"
                  : path.startsWith("/approvals")
                    ? "approvals"
                    : path.startsWith("/automations")
                      ? "jobs"
                      : path.startsWith("/terminal")
                        ? "terminal"
                        : path.startsWith("/account")
                          ? "account"
                          : path.startsWith("/settings")
                            ? "settings"
                            : "files",
              ),
        ]}
        LinkComponent={ShellLink}
        notice={
          <>
            <TerminalRequestNotice accountId={accountId} />
            {engine === "error" && isDesktop() && (
              <EngineNotice
                code={engineCode}
                restart={async (replace) => {
                  const ready = await restartEngine(replace);
                  setEngine(ready ? "ready" : "error");
                  return ready;
                }}
              />
            )}
          </>
        }
        account={
          <AccountMenu
            key={accountId ?? "signed-out"}
            user={accountId ? (session.data?.user ?? null) : null}
            pending={session.isPending}
            busy={auth.busy}
            error={Boolean(auth.error)}
            onNavigate={(destination) =>
              destination === "login"
                ? void router.navigate({
                    to: "/login",
                    search: { returnTo: desktopReturnTo(href) },
                  })
                : void router.navigate({ to: `/${destination}` })
            }
            onSignOut={async () => {
              const result = await auth.signOut(async () => {
                if (accountId) await signOutDesktopHost(accountId);
                // Drop every account-scoped query before the next session reads.
                analytics.reset();
                queryClient.removeQueries({
                  predicate: (query) => query.queryKey.includes(accountId),
                });
                await router.invalidate();
                await router.navigate({ to: "/", replace: true });
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
