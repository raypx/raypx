import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { GearSix, UserCircle } from "@phosphor-icons/react";
import { Logo } from "@raypx/ui/logo";
import { useTranslations } from "@raypx/i18n/browser";
import { AccountPage } from "./pages/account";
import { SettingsPage } from "./pages/settings";
import { AuthPage } from "./pages/auth";

function Shell() {
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
const root = createRootRoute({ component: Shell });
const account = createRoute({ getParentRoute: () => root, path: "/", component: AccountPage });
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
  routeTree: root.addChildren([account, settings, login, signup, forgot, reset, verify]),
  defaultPreload: "intent",
  scrollRestoration: true,
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
