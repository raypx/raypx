import { InstanceGate } from "./instance-gate";
import { EngineGate } from "../../engine/gate";
import type { ReactNode } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Logo } from "@raypx/ui/logo";
import { AuthPreferences } from "./auth-preferences";

const publicPaths = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

function AuthLayout({ children, login }: { children: ReactNode; login: boolean }) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-[max(3rem,var(--mygo-titlebar-height,0px))] shrink-0 items-center px-6 pr-[max(1.5rem,calc(var(--mygo-titlebar-inset-right,0px)+0.75rem))] pl-[max(1.5rem,calc(var(--mygo-titlebar-inset-left,0px)+0.75rem))] [--app-region:drag]">
        {!login && (
          <Link to="/" aria-label="Raypx" className="inline-flex [--app-region:no-drag]">
            <Logo className="[&_[data-slot=logo-mark]]:size-6" />
          </Link>
        )}
        <AuthPreferences />
      </header>
      <main
        id="main"
        tabIndex={-1}
        data-login={login || undefined}
        className="flex min-h-0 flex-1 flex-col overflow-auto px-6 outline-none data-[login]:max-sm:px-0 data-[login]:[@media(min-height:620px)]:pb-8"
      >
        <div className="my-auto shrink-0">{children}</div>
      </main>
    </div>
  );
}

export function SessionGate({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const login = path === "/login";
  if (publicPaths.has(path))
    return (
      <AuthLayout login={login}>
        <Outlet />
      </AuthLayout>
    );
  return (
    <EngineGate>
      <InstanceGate>{children}</InstanceGate>
    </EngineGate>
  );
}
