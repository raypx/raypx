import { useTranslations } from "../i18n.js";
import { analytics } from "../features/analytics/client.js";
import { AnalyticsIdentity } from "@raypx/analytics/client";
import { AccountMenu } from "@raypx/account/client";
import { authClient } from "../features/auth/client.js";
import { useDesktopSignOut } from "../features/auth/sign-out.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@raypx/ui/components/ui/tooltip";
import { desktopReturnTo } from "../features/auth/return-to.js";
import { useState } from "react";
import {
  Link,
  Outlet,
  useMatches,
  useRouter,
  useRouterState,
  type StaticDataRouteOption,
} from "@tanstack/react-router";
import { SettingsIcon } from "@raypx/icons/settings";
import { AgentIcon } from "@raypx/icons/agent";
import { UserCircleIcon } from "@raypx/icons/user-circle";
import { AppShell, type ShellAction, type ShellLinkProps } from "@raypx/blocks/shell";
import { useCommandShortcut } from "@raypx/blocks/command-palette";
import { SearchIcon } from "@raypx/icons/search";
import { DesktopCommandMenu } from "./command-menu.js";
import { EngineNotice } from "../features/engine/notice.js";
import { desktopStorageKey } from "../lib/storage.js";

import { isDesktop } from "../lib/desktop.js";
import { useDesktopEngine } from "../features/engine/provider.js";
import { WindowDragRegion } from "./window-drag-region.js";
import { Button } from "@raypx/ui/components/ui/button";
import { SettingsOverlay } from "../features/settings/overlay.js";
import { useSettingsNavigation } from "../features/settings/navigation.js";

type DesktopPath = "/agents" | "/account";

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
  const { engine, restart } = useDesktopEngine();
  const [searchOpen, setSearchOpen] = useState(false);
  const shortcut = useCommandShortcut();
  const accountId = session.error || session.isPending ? null : (session.data?.user.id ?? null);
  const pages = [
    { to: "/agents", label: t("agents.title"), icon: <AgentIcon /> },
    { to: "/account", label: c("account"), icon: <UserCircleIcon /> },
  ] as const;
  const actions: ShellAction[] = [
    { label: c("search"), icon: <SearchIcon />, shortcut, onSelect: () => setSearchOpen(true) },
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
          brand={{ to: "/agents", label: "Raypx" }}
          actions={actions}
          navigation={[[pages[0], pages[1]]]}
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
          breadcrumbs={[]}
          layout={page?.layout ?? "document"}
          LinkComponent={ShellLink}
          notice={
            <>
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
                const result = await auth.signOut(accountId, "/login");
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
