import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { GearSix, UserCircle } from "@phosphor-icons/react";
import { Logo } from "@raypx/ui/logo";
import { useTranslations } from "@raypx/i18n/browser";

export function WebShell() {
  const c = useTranslations("common");
  const path = useRouterState({ select: (state) => state.location.pathname });
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
          Raypx
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>Raypx</span>
          <span className="topbar-divider">/</span>
          <span>{c(path === "/settings" ? "settings" : "account")}</span>
        </header>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
