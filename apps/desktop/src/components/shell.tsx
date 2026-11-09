import { analytics } from "../features/analytics/client.ts";
import { AnalyticsIdentity } from "@raypx/analytics/client";
import { PendingCount } from "@raypx/tasks/client/pending-count";
import { AccountMenu } from "@raypx/account/client";
import { authClient } from "../features/auth/client.ts";
import { useDesktopSignOut } from "../features/auth/sign-out.tsx";
import { taskClient } from "../features/tasks/client.ts";
import { TerminalRequestNotice } from "../features/tasks/request-notice.tsx";
import { ProjectNavigation } from "../features/tasks/project-navigation.tsx";
import { RemoteProjectNavigation } from "../features/tasks/remote-navigation.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@raypx/ui/components/ui/tooltip";
import { createPendingClient, localTaskClient } from "../features/tasks/local-client.ts";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { desktopReturnTo } from "../features/auth/return-to.ts";
import { useEffect } from "react";
import {
  Link,
  Outlet,
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
import { AppShell, type ShellLinkProps } from "@raypx/blocks/shell";
import { EngineNotice } from "../features/engine/notice.tsx";
import { desktopStorageKey } from "../lib/storage.ts";
import { useTranslations } from "@raypx/i18n/browser";
import { isDesktop, onLocalEvent } from "../lib/desktop.ts";
import { useDesktopEngine } from "../features/engine/provider.tsx";
import { WindowDragRegion } from "./window-drag-region.tsx";
import { Button } from "@raypx/ui/components/ui/button";
import { SettingsOverlay } from "../features/settings/overlay.tsx";
import { useSettingsNavigation } from "../features/settings/navigation.ts";

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
  return (
    <>
      <AnalyticsIdentity client={analytics} accountId={accountId} />
      <AppShell
        storageKey={desktopStorageKey("raypx_sidebar_open")}
        frame="window"
        brand={{ to: "/", label: "Raypx" }}
        contextNavigation={
          <div className="space-y-6">
            <ProjectNavigation />
            {accountId && <RemoteProjectNavigation key={accountId} accountId={accountId} />}
          </div>
        }
        navigationLabels={[c("workspace")]}
        navigation={[
          [
            { to: "/", label: c("projects"), icon: <FolderOpenIcon />, exact: true },
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
          ],
        ]}
        secondaryNavigation={[
          { to: "/automations", label: c("jobs"), icon: <ScheduleIcon /> },
          { to: "/memory", label: memory("title"), icon: <BookOpenIcon /> },
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
      <SettingsOverlay />
    </>
  );
}
