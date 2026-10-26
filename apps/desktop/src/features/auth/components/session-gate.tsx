import type { ReactNode } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Logo } from "@raypx/ui/logo";

const publicPaths = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-auto">
      <header className="shrink-0 px-10 pt-8 [-webkit-app-region:drag]">
        <Link to="/" aria-label="Raypx" className="inline-flex [-webkit-app-region:no-drag]">
          <Logo />
        </Link>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
    </div>
  );
}

export function SessionGate({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  if (publicPaths.has(path))
    return (
      <AuthLayout>
        <Outlet />
      </AuthLayout>
    );
  return children;
}
