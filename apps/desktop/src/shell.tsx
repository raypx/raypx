import { useEffect, useState } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { Clock, FolderOpen, Settings, SquareTerminal, CircleUserRound } from "lucide-react";
import { Logo } from "@raypx/ui/logo";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "@raypx/i18n/browser";
import { getDesktopRuntime, isDesktop, onLocalEvent, restartEngine } from "./lib/desktop";

const sidebarClassName =
  "flex w-56 shrink-0 flex-col border-r border-border bg-sidebar px-4 pt-11 pb-5 max-[1100px]:w-[190px] max-[760px]:px-2.5 max-[420px]:px-1.5";
const brandClassName =
  "mx-3 mb-[38px] w-fit max-[760px]:mx-auto max-[760px]:mb-8 max-[760px]:[&_[data-slot=logo]>span]:hidden";
const topbarClassName =
  "flex h-[66px] shrink-0 items-center gap-[13px] border-b border-border pr-10 pl-10 text-[13px] text-muted-foreground [-webkit-app-region:drag] max-[760px]:h-[58px] max-[760px]:pr-6 [&>:last-child]:text-foreground";
const navigationLinkClassName =
  "flex min-h-10 items-center gap-[11px] rounded-[7px] px-3 text-muted-foreground transition-[background-color,color] duration-150 ease-[ease] hover:bg-muted hover:text-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-[550] aria-[current=page]:text-foreground aria-[current=page]:hover:bg-sidebar-accent max-[760px]:justify-center max-[760px]:px-0 max-[760px]:text-[0px] max-[760px]:[&>span]:hidden max-[760px]:[&_svg]:size-[21px]";

/** Prerendered before device preferences are known, so it carries no translated text. */
export function ShellSkeleton() {
  return (
    <div className="flex h-dvh min-h-dvh" aria-busy="true">
      <aside className={sidebarClassName}>
        <span className={brandClassName}>
          <Logo />
        </span>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className={topbarClassName} />
      </div>
    </div>
  );
}

export function DesktopShell() {
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
  return (
    <div className="flex h-dvh min-h-dvh">
      <a
        href="#main"
        className="fixed top-2 left-2 z-30 -translate-y-[160%] bg-foreground px-4 py-2 text-background focus:translate-y-0"
      >
        {c("skipNavigation")}
      </a>
      <aside className={sidebarClassName}>
        <Link to="/" className={brandClassName} aria-label="Raypx">
          <Logo />
        </Link>
        <nav aria-label="Raypx" className="flex flex-col gap-1.25">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className={navigationLinkClassName}
            activeProps={{ "aria-current": "page" }}
          >
            <FolderOpen size={19} />
            {c("files")}
          </Link>
          <Link
            to="/automations"
            className={navigationLinkClassName}
            activeProps={{ "aria-current": "page" }}
          >
            <Clock size={19} />
            {c("jobs")}
          </Link>
          <Link
            to="/terminal"
            className={navigationLinkClassName}
            activeProps={{ "aria-current": "page" }}
          >
            <SquareTerminal size={19} />
            {c("terminal")}
          </Link>
          <span className="mx-2.5 my-[18px] h-px bg-border" />
          <Link
            to="/account"
            className={navigationLinkClassName}
            activeProps={{ "aria-current": "page" }}
          >
            <CircleUserRound size={19} />
            {c("account")}
          </Link>
          <Link
            to="/settings"
            className={navigationLinkClassName}
            activeProps={{ "aria-current": "page" }}
          >
            <Settings size={19} />
            {c("settings")}
          </Link>
        </nav>
        <div className="mt-auto flex items-center gap-2 px-3 pt-7 text-xs text-muted-foreground max-[760px]:hidden">
          <span className="size-1.5 rounded-full bg-foreground" />
          Raypx · 0.1.0
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className={topbarClassName}>
          <span>Raypx</span>
          <span className="opacity-45">/</span>
          <span>{c("device")}</span>
        </header>
        {engine === "error" && isDesktop() && (
          <div className="flex items-center justify-between gap-5 bg-muted px-8 py-4" role="alert">
            <div>
              <strong className="text-[13px] font-medium">{e("unavailable")}</strong>
              <p className="text-xs text-muted-foreground">{e("hint")}</p>
            </div>
            <Button variant="outline" disabled={restarting} onClick={() => void retry()}>
              {e("retry")}
            </Button>
          </div>
        )}
        <main id="main" tabIndex={-1} className="flex-1 overflow-auto outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
