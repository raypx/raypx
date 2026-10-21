import type { ReactNode } from "react";
import { Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { Logo } from "@raypx/ui/logo";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "@raypx/i18n/browser";
import { authClient } from "../client";

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
        <Link to="/login" aria-label="Raypx" className="inline-flex [-webkit-app-region:no-drag]">
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
  const session = authClient.useSession();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const c = useTranslations("common");
  if (session.data?.user) return children;
  if (session.isPending)
    return (
      <AuthLayout>
        <div role="status" aria-label={c("loading")} className="mx-auto max-w-90 px-6 pt-24">
          <div className="h-7 w-40 rounded bg-muted motion-safe:animate-pulse" />
          <div className="mt-6 h-10 rounded bg-muted motion-safe:animate-pulse" />
          <div className="mt-4 h-10 rounded bg-muted motion-safe:animate-pulse" />
        </div>
      </AuthLayout>
    );
  if (publicPaths.has(path))
    return (
      <AuthLayout>
        <Outlet />
      </AuthLayout>
    );
  if (session.error)
    return (
      <AuthLayout>
        <div className="mx-auto max-w-lg space-y-5 px-8 pt-24">
          <p role="alert">{c("networkError")}</p>
          <Button variant="outline" onClick={() => void session.refetch()}>
            {c("retry")}
          </Button>
        </div>
      </AuthLayout>
    );
  return <Navigate to="/login" replace />;
}
