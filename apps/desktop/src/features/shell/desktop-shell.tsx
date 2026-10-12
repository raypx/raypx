import {
  FolderSimple,
  Gear,
  House,
  Moon,
  SidebarSimple,
  Sun,
  Pulse,
  Translate,
  TrayArrowDown,
} from "@phosphor-icons/react";
import { LOCALE_OPTIONS } from "@voidmix/i18n";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { IconButton } from "@voidmix/ui/icon-button";
import { Logo } from "@voidmix/ui/logo";
import { cn } from "@voidmix/ui/lib/utils";
import { useEffect, useState } from "react";
import { getDesktopRuntime, hideMainWindow, type DesktopRuntime } from "../../lib/desktop";
import { useDesktopPreferences } from "../../lib/preferences";
import { AccountControl } from "./account-control";
import { DesktopAccountProvider, useDesktopAccount } from "./account-provider";
import { useDesktopTranslations, useLocale, useSetLocale } from "../../i18n/client";

function WindowActions() {
  const t = useDesktopTranslations("common");
  const [message, setMessage] = useState("");

  async function handleHide() {
    const hidden = await hideMainWindow();
    if (!hidden) {
      setMessage(t("trayMessage"));
      window.setTimeout(() => setMessage(""), 2800);
    }
  }

  return (
    <div className="window-actions relative flex items-center gap-2">
      {message ? (
        <span className="window-message absolute right-0 top-11 w-65 p-3 border border-border rounded-[8px] bg-popover text-[12px] z-30">
          {message}
        </span>
      ) : null}
      <IconButton
        size="icon"
        variant="ghost"
        onClick={() => void handleHide()}
        label={t("hideToTray")}
      >
        <TrayArrowDown aria-hidden="true" />
      </IconButton>
    </div>
  );
}

export function DesktopShell() {
  return (
    <DesktopAccountProvider>
      <DesktopShellContent />
    </DesktopAccountProvider>
  );
}

function DesktopShellContent() {
  const t = useDesktopTranslations("common");
  const themeT = useDesktopTranslations("settings");
  const locale = useLocale();
  const setLocale = useSetLocale();
  const nextLocale = LOCALE_OPTIONS.find((option) => option.value !== locale)!;
  const pathname = useLocation({ select: (location) => location.pathname });
  const account = useDesktopAccount();
  const protectedPage = pathname !== "/settings";
  const navigation = [
    { to: "/", label: t("home"), icon: House },
    { to: "/projects", label: t("projects"), icon: FolderSimple },
    { to: "/activity", label: t("activity"), icon: Pulse },
    { to: "/settings", label: t("settings"), icon: Gear },
  ] as const;
  const theme = useDesktopPreferences((state) => state.theme);
  const toggleTheme = useDesktopPreferences((state) => state.toggleTheme);
  const [collapsed, setCollapsed] = useState(false);
  const [runtime, setRuntime] = useState<DesktopRuntime>({
    appVersion: "0.1.0",
    platform: "browser",
    trayEnabled: false,
  });

  useEffect(() => {
    void useDesktopPreferences.persist.rehydrate();
    void getDesktopRuntime().then(setRuntime);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  return (
    <div
      className="desktop-shell group/desktop-shell flex h-screen bg-background"
      data-collapsed={collapsed || undefined}
    >
      <aside className="sidebar group-data-[collapsed]/desktop-shell:basis-18 group-data-[collapsed]/desktop-shell:px-3 flex [flex:0_0_224px] min-w-0 flex-col pt-6 pb-4 px-3.5 border-r border-border bg-sidebar">
        <Link
          to="/projects"
          className="brand group-data-[collapsed]/desktop-shell:px-0 group-data-[collapsed]/desktop-shell:justify-center group-data-[collapsed]/desktop-shell:[&_[data-slot=logo]>span]:hidden flex pt-0 pb-7 px-3 text-foreground [&_img]:size-7"
          aria-label={t("projects")}
        >
          <Logo label="VoidMix" />
        </Link>

        <nav className="primary-nav flex flex-col gap-1.5" aria-label={t("primaryNavigation")}>
          <p className="nav-label group-data-[collapsed]/desktop-shell:hidden mt-0 mb-2 mx-3 text-[12px] text-muted-foreground">
            {t("control")}
          </p>
          {navigation.map(({ to, label, icon: Icon }) => {
            const active =
              to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
            const stateProps = {
              className: cn(
                "nav-link flex min-h-10 items-center gap-3 rounded-[8px] px-3 py-2 text-sm leading-[1.6] font-medium text-muted-foreground transition-colors duration-180 hover:bg-muted hover:text-foreground aria-[current=page]:bg-secondary aria-[current=page]:text-foreground group-data-[collapsed]/desktop-shell:justify-center group-data-[collapsed]/desktop-shell:px-0 [&_svg]:shrink-0",
                active && "active",
              ),
              "aria-current": active ? ("page" as const) : undefined,
            };
            return (
              <Link
                key={to}
                to={to}
                aria-label={label}
                title={label}
                activeProps={stateProps}
                inactiveProps={stateProps}
              >
                <Icon size={16} weight="regular" />
                <span className="group-data-[collapsed]/desktop-shell:hidden">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-spacer flex-1 min-h-6" />
        <AccountControl />
        <div className="runtime-status group-data-[collapsed]/desktop-shell:hidden flex items-center gap-2.5 py-3 px-2.5 [&_>_span:last-child]:flex [&_>_span:last-child]:min-w-0 [&_>_span:last-child]:flex-col [&_strong]:truncate [&_strong]:text-[12px] [&_strong]:font-medium [&_small]:wrap-anywhere [&_small]:text-[12px] [&_small]:text-muted-foreground">
          <span
            className={cn(
              "runtime-dot size-1.5 shrink-0 rounded-full bg-muted-foreground",
              runtime.trayEnabled && "ready bg-success",
            )}
          />
          <span>
            <strong>{runtime.trayEnabled ? t("desktopReady") : t("browserPreview")}</strong>
            <small>
              v{runtime.appVersion} · {runtime.platform}
            </small>
          </span>
        </div>
      </aside>

      <div className="app-frame min-w-0 flex-1 flex flex-col">
        <header
          className="titlebar shrink-0 flex items-center gap-2.5 h-14 py-0 px-6 border-b border-border bg-card"
          data-tauri-drag-region
        >
          <IconButton
            size="icon"
            variant="ghost"
            label={t(collapsed ? "expandNavigation" : "collapseNavigation")}
            aria-pressed={collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            <SidebarSimple aria-hidden="true" />
          </IconButton>
          <span className="titlebar-context mr-auto text-muted-foreground text-[12px]">
            {t("control")}
          </span>
          <IconButton
            size="icon"
            variant="ghost"
            onClick={toggleTheme}
            label={theme === "dark" ? themeT("lightTheme") : themeT("darkTheme")}
          >
            {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </IconButton>
          <IconButton
            size="icon"
            variant="ghost"
            onClick={() => void setLocale(nextLocale.value).catch(() => undefined)}
            label={nextLocale.nativeName}
            hint={`${t("language")}: ${nextLocale.nativeName}`}
          >
            <Translate aria-hidden="true" />
          </IconButton>
          <WindowActions />
        </header>
        <main className="app-content flex-1 min-h-0 overflow-auto">
          {protectedPage && account.status !== "signed_in" ? (
            <p className="p-8 text-sm text-muted-foreground" role="status">
              {t(
                account.status === "loading"
                  ? "accountLoading"
                  : account.status === "signed_out"
                    ? "signedOut"
                    : account.status === "unconfigured"
                      ? "accountUnconfigured"
                      : "accountUnavailable",
              )}
            </p>
          ) : (
            <Outlet key={account.status === "signed_in" ? account.profile.id : "public"} />
          )}
        </main>
      </div>
    </div>
  );
}
