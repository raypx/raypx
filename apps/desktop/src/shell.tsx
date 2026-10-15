import { useEffect, useState } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { Clock, FolderOpen, Settings, SquareTerminal, CircleUserRound } from "lucide-react";
import { Logo } from "@raypx/ui/logo";
import { Button } from "@raypx/ui/components/ui/button";
import { useLanguagePreference, useTranslations } from "@raypx/i18n/browser";
import { useTheme } from "@raypx/ui/theme/client";
import {
  getDesktopRuntime,
  isDesktop,
  onLocalEvent,
  restartEngine,
  saveDesktopPreferences,
} from "./lib/desktop";

/** Prerendered before device preferences are known, so it carries no translated text. */
export function ShellSkeleton() {
  return (
    <div className="app-shell" aria-busy="true">
      <aside className="sidebar">
        <span className="brand-link">
          <Logo />
        </span>
      </aside>
      <div className="workspace">
        <header className="topbar" />
      </div>
    </div>
  );
}

export function DesktopShell() {
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
            <SquareTerminal size={19} />
            {c("terminal")}
          </Link>
          <span className="nav-separator" />
          <Link to="/account" activeProps={{ className: "active", "aria-current": "page" }}>
            <CircleUserRound size={19} />
            {c("account")}
          </Link>
          <Link to="/settings" activeProps={{ className: "active", "aria-current": "page" }}>
            <Settings size={19} />
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
