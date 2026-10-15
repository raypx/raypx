import { useEffect, useState } from "react";
import {
  createHashHistory,
  lazyRouteComponent,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { Clock, FolderOpen, GearSix, TerminalWindow, UserCircle } from "@phosphor-icons/react";
import { Logo } from "@raypx/ui/logo";
import { Button } from "@raypx/ui/components/ui/button";
import { useLanguagePreference, useTranslations } from "@raypx/i18n/browser";
import { useTheme } from "@raypx/ui/theme/client";
import { AccountPage } from "./pages/account";
import { SettingsPage } from "./pages/settings";
import { AuthPage } from "./pages/auth";
import { FilesPage } from "./pages/files";
import { JobsPage } from "./pages/jobs";
import {
  getDesktopRuntime,
  isDesktop,
  onLocalEvent,
  restartEngine,
  saveDesktopPreferences,
} from "./lib/desktop";

function Shell() {
  const c = useTranslations("common");
  const e = useTranslations("engine");
  const { theme } = useTheme();
  const { preference } = useLanguagePreference();
  useEffect(() => {
    void saveDesktopPreferences({ theme, locale: preference }).catch(() => {});
  }, [theme, preference]);
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
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        {c("skipNavigation")}
      </a>
      <aside className="sidebar">
        <Link to="/" className="brand-link" aria-label="Raypx">
          <Logo />
        </Link>
        <nav aria-label="Raypx">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: "active", "aria-current": "page" }}
          >
            <FolderOpen size={19} />
            {c("files")}
          </Link>
          <Link to="/automations" activeProps={{ className: "active", "aria-current": "page" }}>
            <Clock size={19} />
            {c("jobs")}
          </Link>
          <Link to="/terminal" activeProps={{ className: "active", "aria-current": "page" }}>
            <TerminalWindow size={19} />
            {c("terminal")}
          </Link>
          <span className="nav-separator" />
          <Link to="/account" activeProps={{ className: "active", "aria-current": "page" }}>
            <UserCircle size={19} />
            {c("account")}
          </Link>
          <Link to="/settings" activeProps={{ className: "active", "aria-current": "page" }}>
            <GearSix size={19} />
            {c("settings")}
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <span className="brand-dot" />
          Raypx · 0.1.0
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>Raypx</span>
          <span className="topbar-divider">/</span>
          <span>{c("device")}</span>
        </header>
        {engine === "error" && isDesktop() && (
          <div className="engine-banner" role="alert">
            <div>
              <strong>{e("unavailable")}</strong>
              <p>{e("hint")}</p>
            </div>
            <Button variant="outline" disabled={restarting} onClick={() => void retry()}>
              {e("retry")}
            </Button>
          </div>
        )}
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
const root = createRootRoute({ component: Shell });
const files = createRoute({ getParentRoute: () => root, path: "/", component: FilesPage });
const jobs = createRoute({ getParentRoute: () => root, path: "/automations", component: JobsPage });
const terminal = createRoute({
  getParentRoute: () => root,
  path: "/terminal",
  component: lazyRouteComponent(() => import("./pages/terminal"), "TerminalPage"),
});
const account = createRoute({
  getParentRoute: () => root,
  path: "/account",
  component: AccountPage,
});
const settings = createRoute({
  getParentRoute: () => root,
  path: "/settings",
  component: SettingsPage,
});
const login = createRoute({
  getParentRoute: () => root,
  path: "/login",
  component: () => <AuthPage mode="login" />,
});
const signup = createRoute({
  getParentRoute: () => root,
  path: "/signup",
  component: () => <AuthPage mode="signup" />,
});
const forgot = createRoute({
  getParentRoute: () => root,
  path: "/forgot-password",
  component: () => <AuthPage mode="forgot-password" />,
});
const reset = createRoute({
  getParentRoute: () => root,
  path: "/reset-password",
  component: () => <AuthPage mode="reset-password" />,
});
const verify = createRoute({
  getParentRoute: () => root,
  path: "/verify-email",
  component: () => <AuthPage mode="verify-email" />,
});
export const router = createRouter({
  routeTree: root.addChildren([
    files,
    jobs,
    terminal,
    account,
    settings,
    login,
    signup,
    forgot,
    reset,
    verify,
  ]),
  ...(window.location.protocol === "views:" ? { history: createHashHistory() } : {}),
  defaultPreload: "intent",
  scrollRestoration: true,
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
