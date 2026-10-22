import { analytics } from "../features/analytics/client";
import { AnalyticsIdentity } from "@raypx/analytics/client";
import { PendingCount } from "@raypx/tasks/client/pending-count";
import { useQueryClient } from "@tanstack/react-query";
import { AccountMenu } from "@raypx/account/client";
import { useAuthActions } from "@raypx/auth/hooks";
import { authClient, webUrl } from "../features/auth/client";
import { taskClient } from "../features/tasks/client";
import { createPendingClient, localTaskClient } from "../features/tasks/local-client";
import { useEffect, useState } from "react";
import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import {
  Clock,
  FolderOpen,
  ListTodo,
  Inbox,
  Settings,
  SquareTerminal,
  CircleUserRound,
} from "lucide-react";
import { AppShell, type ShellLinkProps } from "@raypx/blocks/shell";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "@raypx/i18n/browser";
import { getDesktopRuntime, isDesktop, onLocalEvent, restartEngine } from "../lib/desktop";

const pendingClient = createPendingClient(localTaskClient, taskClient);

type DesktopPath =
  | "/"
  | "/automations"
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
  const c = useTranslations("common");
  const e = useTranslations("engine");
  const [engine, setEngine] = useState("starting");
  const [restarting, setRestarting] = useState(false);
  useEffect(() => {
    let active = true;
    void getDesktopRuntime()
      .then((runtime) => {
        if (active) setEngine(runtime.engine.status);
      })
      .catch(() => {
        if (active) setEngine("error");
      });
    const stop = onLocalEvent((event) => {
      if (event.event === "engine.status" && typeof event.data.status === "string")
        setEngine(event.data.status);
    });
    return () => {
      active = false;
      stop();
    };
  }, []);
  async function retry() {
    setRestarting(true);
    try {
      setEngine((await restartEngine()) ? "ready" : "error");
    } catch {
      setEngine("error");
    } finally {
      setRestarting(false);
    }
  }
  const accountId = session.data?.user.id ?? null;
  return (
    <>
      <AnalyticsIdentity client={analytics} accountId={accountId} />
      <AppShell
        frame="window"
        brand={{ to: "/", label: "Raypx" }}
        navigation={[
          [
            { to: "/", label: c("files"), icon: <FolderOpen size={19} />, exact: true },
            { to: "/automations", label: c("jobs"), icon: <Clock size={19} /> },
            { to: "/terminal", label: c("terminal"), icon: <SquareTerminal size={19} /> },
          ],
          [
            { to: "/account", label: c("account"), icon: <CircleUserRound size={19} /> },
            { to: "/settings", label: c("settings"), icon: <Settings size={19} /> },
            { to: "/tasks", label: c("tasks"), icon: <ListTodo size={19} /> },
            {
              to: "/approvals",
              label: c("approvals"),
              icon: <Inbox size={19} />,
              badge: (
                <PendingCount
                  key={accountId ?? "signed-out"}
                  client={pendingClient}
                  accountId={accountId}
                />
              ),
            },
          ],
        ]}
        breadcrumbs={[
          "Raypx",
          c(
            path.startsWith("/tasks")
              ? "tasks"
              : path.startsWith("/approvals")
                ? "approvals"
                : "device",
          ),
        ]}
        LinkComponent={ShellLink}
        notice={
          engine === "error" &&
          isDesktop() && (
            <div
              className="flex items-center justify-between gap-5 bg-muted px-8 py-4"
              role="alert"
            >
              <div>
                <strong className="text-[13px] font-medium">{e("unavailable")}</strong>
                <p className="text-xs text-muted-foreground">{e("hint")}</p>
              </div>
              <Button variant="outline" disabled={restarting} onClick={() => void retry()}>
                {e("retry")}
              </Button>
            </div>
          )
        }
        account={
          <AccountMenu
            key={accountId ?? "signed-out"}
            user={session.data?.user ?? null}
            pending={session.isPending}
            busy={auth.busy}
            error={Boolean(auth.error)}
            onNavigate={(destination) => void router.navigate({ to: `/${destination}` })}
            onSignOut={async () => {
              const result = await auth.signOut(async () => {
                // Drop every account-scoped query before the next session reads.
                analytics.reset();
                queryClient.clear();
                await router.invalidate();
                await router.navigate({ to: "/login", replace: true });
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
