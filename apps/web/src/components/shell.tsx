import { analytics } from "../features/analytics/client";
import { AnalyticsIdentity } from "@raypx/analytics/client";
import { useEffect } from "react";
import { PendingCount } from "@raypx/tasks/client/pending-count";
import { AccountMenu } from "@raypx/account/client";
import { useAuthActions } from "@raypx/auth/hooks";
import { authClient, webUrl } from "../features/auth/client";
import { taskClient } from "../features/tasks/client";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { ListTodo, Inbox, Settings, CircleUserRound } from "lucide-react";
import { Logo } from "@raypx/ui/logo";
import { useTranslations } from "@raypx/i18n/browser";

const navigationClassName =
  "flex min-h-10 items-center gap-[11px] rounded-[7px] px-3 text-muted-foreground transition-[background-color,color] duration-150 hover:bg-muted hover:text-foreground [&.active]:bg-sidebar-accent [&.active]:font-[550] [&.active]:text-foreground [&.active]:hover:bg-sidebar-accent max-[760px]:justify-center max-[760px]:px-0 max-[760px]:text-[0px] max-[760px]:[&_svg]:size-[21px]";

export function WebShell() {
  const session = authClient.useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const accountId = session.data?.user.id ?? null;
  useEffect(() => {
    taskClient.setAccount?.(accountId);
    return () => taskClient.setAccount?.(null);
  }, [accountId]);
  const auth = useAuthActions({ client: authClient, webUrl });
  const c = useTranslations("common");
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <div className="flex min-h-dvh">
      <AnalyticsIdentity client={analytics} accountId={accountId} />
      <a
        href="#main"
        className="fixed top-2 left-2 z-30 -translate-y-[160%] bg-foreground px-4 py-2 text-background focus:translate-y-0"
      >
        {c("skipNavigation")}
      </a>
      <aside className="sticky top-0 flex h-dvh w-56 shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar px-4 pt-7 pb-5 max-[760px]:w-18 max-[760px]:px-2.5 max-[760px]:py-5 max-[420px]:w-[58px] max-[420px]:px-1.5">
        <Link
          to="/"
          className="mx-3 mb-[38px] w-fit max-[760px]:mx-auto max-[760px]:mb-8 max-[760px]:[&_[data-slot=logo]>span]:hidden"
          aria-label="Raypx"
        >
          <Logo />
        </Link>
        <nav aria-label="Raypx" className="flex flex-col gap-1.25">
          <Link
            to="/"
            className={navigationClassName}
            activeOptions={{ exact: true }}
            activeProps={{ className: "active", "aria-current": "page" }}
          >
            <CircleUserRound size={19} />
            {c("account")}
          </Link>
          <Link
            to="/settings"
            className={navigationClassName}
            activeProps={{ className: "active", "aria-current": "page" }}
          >
            <Settings size={19} />
            {c("settings")}
          </Link>
          <Link
            to="/tasks"
            className={navigationClassName}
            activeProps={{ "aria-current": "page" }}
          >
            <ListTodo size={19} />
            {c("tasks")}
          </Link>
          <Link
            to="/approvals"
            className={navigationClassName}
            activeProps={{ "aria-current": "page" }}
          >
            <Inbox size={19} />
            {c("approvals")}
            <PendingCount
              key={session.data?.user.id ?? "signed-out"}
              client={taskClient}
              accountId={session.data?.user.id ?? null}
            />
          </Link>
        </nav>
        <div className="mt-auto pt-7">
          <AccountMenu
            key={session.data?.user.id ?? "signed-out"}
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
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-[66px] items-center gap-[13px] border-b border-border px-10 text-[13px] text-muted-foreground max-[760px]:h-[58px] max-[760px]:px-6">
          <span>Raypx</span>
          <span className="opacity-45">/</span>
          <span className="text-foreground">
            {c(
              path.startsWith("/tasks")
                ? "tasks"
                : path.startsWith("/approvals")
                  ? "approvals"
                  : path === "/settings"
                    ? "settings"
                    : "account",
            )}
          </span>
        </header>
        <main id="main" tabIndex={-1} className="outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
