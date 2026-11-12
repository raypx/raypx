import { useTranslations } from "../../../i18n.js";
import { InstanceGate } from "./instance-gate.js";
import { EngineGate } from "../../engine/gate.js";
import type { ReactNode } from "react";
import { Link, Outlet, useLocation, useRouterState } from "@tanstack/react-router";
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";

import { buttonVariants } from "@raypx/ui/components/ui/button";
import { Logo } from "@raypx/ui/logo";
import { LanguageMenu, ThemeToggle } from "@raypx/blocks/preference-controls";
import { desktopReturnTo } from "../return-to.js";

const publicPaths = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const search = useLocation({ select: (location) => location.searchStr });
  const returnTo = desktopReturnTo(new URLSearchParams(search).get("returnTo"));
  return (
    <div className="flex h-dvh flex-col bg-sidebar">
      <header className="flex h-[max(3.5rem,var(--mygo-titlebar-height,0px))] shrink-0 items-center gap-6 px-6 pr-[max(1.5rem,calc(var(--mygo-titlebar-inset-right,0px)+0.75rem))] pl-[max(1.5rem,calc(var(--mygo-titlebar-inset-left,0px)+0.75rem))] [--app-region:drag]">
        <Link
          to="/"
          aria-label="Raypx"
          className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring [--app-region:no-drag]"
        >
          <Logo className="text-sm [&_[data-slot=logo-mark]]:size-6" />
        </Link>
        <div className="ml-auto flex items-center gap-1 [--app-region:no-drag]">
          <Link to={returnTo} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <ArrowLeftIcon data-icon="inline-start" />
            {t("backToWorkspace")}
          </Link>
          <ThemeToggle />
          <LanguageMenu />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex min-h-0 flex-1 flex-col overflow-auto px-6 py-8 outline-none"
      >
        <div className="mx-auto my-auto w-full max-w-[466px] shrink-0 rounded-[16px] border border-border bg-background p-8">
          {children}
        </div>
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
  return (
    <EngineGate>
      <InstanceGate>{children}</InstanceGate>
    </EngineGate>
  );
}
