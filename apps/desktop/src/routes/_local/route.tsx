import { useEffect } from "react";
import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { isDesktop, onLocalEvent } from "../../lib/desktop";
import { localRequest } from "../../lib/desktop";
import type { RootGrant } from "@raypx/contracts/local";
import { useTranslations } from "@raypx/i18n/browser";

export const Route = createFileRoute("/_local")({
  ssr: false,
  preload: false,
  staleTime: Infinity,
  shouldReload: ({ cause }) => cause === "enter",
  beforeLoad: () => ({ desktopAvailable: isDesktop() }),
  loader: async ({ context }): Promise<{ roots: RootGrant[] | null }> => {
    if (!context.desktopAvailable) return { roots: [] };
    try {
      return { roots: await localRequest<RootGrant[]>("roots.list", {}) };
    } catch {
      return { roots: null };
    }
  },
  component: LocalLayout,
  pendingComponent: LocalPending,
});

function LocalPending() {
  const c = useTranslations("common");
  return <p role="status">{c("loading")}</p>;
}

function LocalLayout() {
  const router = useRouter();
  const { desktopAvailable } = Route.useRouteContext();
  useEffect(() => {
    if (!desktopAvailable) return;
    return onLocalEvent((event) => {
      if (event.event === "engine.status" && event.data.status === "ready")
        void router.invalidate({
          filter: (match) => match.routeId.startsWith("/_local"),
        });
      else if (
        event.event === "job.finished" &&
        router.state.matches.some((match) => match.routeId === "/_local/automations")
      )
        void router.invalidate({ filter: (match) => match.routeId === "/_local/automations" });
    });
  }, [desktopAvailable, router]);
  return <Outlet />;
}
