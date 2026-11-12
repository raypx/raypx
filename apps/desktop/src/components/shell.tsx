import { useTranslations } from "../i18n.js";
import { analytics } from "../features/analytics/client.js";
import { AnalyticsIdentity } from "@raypx/analytics/client";
import { PendingCount } from "@raypx/tasks/client/pending-count";
import { AccountMenu } from "@raypx/account/client";
import { authClient } from "../features/auth/client.js";
import { useDesktopSignOut } from "../features/auth/sign-out.js";
import { taskClient } from "../features/tasks/client.js";
import { TerminalRequestNotice } from "../features/tasks/request-notice.js";
import { ProjectNavigation } from "../features/tasks/project-navigation.js";
import { RemoteProjectNavigation } from "../features/tasks/remote-navigation.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@raypx/ui/components/ui/tooltip";
import { createPendingClient, localTaskClient } from "../features/tasks/local-client.js";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { desktopReturnTo } from "../features/auth/return-to.js";
import { useEffect, useState } from "react";
import {
  Link,
  Outlet,
  useLocation,
  useMatches,
  useRouter,
  useRouterState,
  type StaticDataRouteOption,
} from "@tanstack/react-router";
import { ScheduleIcon } from "@raypx/icons/schedule";
import { FolderOpenIcon } from "@raypx/icons/folder-open";
import { InboxIcon } from "@raypx/icons/inbox";
import { SettingsIcon } from "@raypx/icons/settings";
import { BookOpenIcon } from "@raypx/icons/book-open";
import { AppShell, type ShellAction, type ShellLinkProps } from "@raypx/blocks/shell";
import { useCommandShortcut } from "@raypx/blocks/command-palette";
import { PlusIcon } from "@raypx/icons/plus";
import { SearchIcon } from "@raypx/icons/search";
import { DesktopCommandMenu } from "./command-menu.js";
import { EngineNotice } from "../features/engine/notice.js";
import { desktopStorageKey } from "../lib/storage.js";

import { isDesktop, onLocalEvent } from "../lib/desktop.js";
import { useDesktopEngine } from "../features/engine/provider.js";
import { WindowDragRegion } from "./window-drag-region.js";
import { Button } from "@raypx/ui/components/ui/button";
import { SettingsOverlay } from "../features/settings/overlay.js";
import { useSettingsNavigation } from "../features/settings/navigation.js";

const pendingClient = createPendingClient(localTaskClient, taskClient);

type DesktopPath =
  | "/"
  | "/files"
  | "/automations"
  | "/memory"
  | "/terminal"
  | "/account"
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
  return (
    <div className="h-dvh min-h-dvh" aria-busy="true">
      <WindowDragRegion />
    </div>
  );
}

export function DesktopShell() {
  const session = authClient.useSession();
  const router = useRouter();
  const settings = useSettingsNavigation();
  const auth = useDesktopSignOut();
  const routeReady = useRouterState({ select: (state) => !state.isLoading });
  const href = useRouterState({ select: (state) => state.location.href });
  const page = useMatches({
    select: (matches) =>
      matches.reduce<StaticDataRouteOption["page"]>(
        (found, match) => match.staticData.page ?? found,
        undefined,
      ),
  });
  const t = useTranslations();
  const c = useTranslations("common");
  const memory = useTranslations("memory");
  const { engine, restart } = useDesktopEngine();
  const [searchOpen, setSearchOpen] = useState(false);
  const shortcut = useCommandShortcut();
  // New session starts in the project on screen; otherwise in the most recent project.
  const target = useLocation({
    select: (location) => {
      if (location.pathname !== "/tasks") return null;
      const search = new URLSearchParams(location.searchStr);
      const project = search.get("project"),
        device = search.get("device");
      if (!project || !device) return null;
      return `${search.get("scope") === "remote" ? "remote" : "local"}:${device}:${project}`;
    },
  });
  useEffect(() => {
    const stop = onLocalEvent((event) => {
      if (event.event === "approval.open")
        void router.navigate({
          to: "/approvals",
          search: { scope: event.data.scope === "remote" ? "remote" : "local" },
        });
    });
    return () => {
      stop();
    };
  }, [router]);
  const accountId = session.error || session.isPending ? null : (session.data?.user.id ?? null);
  const pages = [
    { to: "/", label: c("projects"), icon: <FolderOpenIcon /> },
    { to: "/approvals", label: c("approvals"), icon: <InboxIcon /> },
    { to: "/automations", label: c("jobs"), icon: <ScheduleIcon /> },
    { to: "/memory", label: memory("title"), icon: <BookOpenIcon /> },
  ] as const;
  const [targetScope, targetDevice, targetProject] = target?.split(":") ?? [];
  const actions: ShellAction[] = [
    { label: c("search"), icon: <SearchIcon />, shortcut, onSelect: () => setSearchOpen(true) },
    {
      label: c("newSession"),
      icon: <PlusIcon />,
      render: (
        <Link
          to="/tasks"
          search={{
            scope: targetScope === "remote" ? "remote" : "local",
            ...(targetDevice && targetProject
              ? { device: targetDevice, project: targetProject }
              : {}),
            compose: true,
          }}
          activeOptions={{ exact: true }}
        />
      ),
    },
  ];
  return (
    <>
      <AnalyticsIdentity client={analytics} accountId={accountId} />
      <div
        className="h-full"
        data-raypx-workbench-ready={engine.status === "ready" && routeReady ? "true" : undefined}
      >
        <AppShell
          storageKey={desktopStorageKey("raypx_sidebar_open")}
          frame="window"
          brand={{ to: "/", label: "Raypx" }}
          actions={actions}
          contextNavigation={
            <div className="space-y-6">
              <ProjectNavigation />
              {accountId && <RemoteProjectNavigation key={accountId} accountId={accountId} />}
            </div>
          }
          navigationLabels={[c("workspace")]}
          navigation={[
            [
              { ...pages[0], exact: true },
              {
                to: "/approvals",
                label: c("approvals"),
                icon: <InboxIcon />,
                badge: (
                  <PendingCount
                    key={accountId ?? "signed-out"}
                    client={accountId ? pendingClient : localTaskClient}
                    accountId={accountId ?? LOCAL_WORKSPACE_ID}
                  />
                ),
              },
              pages[2],
              pages[3],
            ],
          ]}
          accountAction={
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    onClick={() => void settings.open()}
                    aria-haspopup="dialog"
                    aria-label={c("settings")}
                    className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  />
                }
              >
                <SettingsIcon aria-hidden="true" className="size-5 stroke-[1.75]" />
              </TooltipTrigger>
              <TooltipContent side="top">{c("settings")}</TooltipContent>
            </Tooltip>
          }
          breadcrumbs={page ? [t(page.title)] : []}
          layout={page?.layout ?? "document"}
          LinkComponent={ShellLink}
          notice={
            <>
              <TerminalRequestNotice accountId={accountId} />
              {engine.status === "error" && isDesktop() && (
                <EngineNotice code={engine.code} restart={restart} />
              )}
            </>
          }
          account={
            <AccountMenu
              key={accountId ?? "signed-out"}
              user={accountId ? (session.data?.user ?? null) : null}
              pending={session.isPending}
              busy={auth.busy}
              error={Boolean(auth.error && auth.error.kind !== "completion")}
              onNavigate={(destination) =>
                destination === "login"
                  ? void router.navigate({
                      to: "/login",
                      search: { returnTo: desktopReturnTo(href) },
                    })
                  : void router.navigate({ to: `/${destination}` })
              }
              onSignOut={async () => {
                const result = await auth.signOut(accountId, "/");
                return result.status === "success";
              }}
            />
          }
        >
          <Outlet />
        </AppShell>
      </div>
      <SettingsOverlay />
      <DesktopCommandMenu
        open={searchOpen}
        onOpenChange={setSearchOpen}
        pages={pages}
        onSettings={() => void settings.open()}
      />
    </>
  );
}
