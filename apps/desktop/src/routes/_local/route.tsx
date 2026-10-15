import { useEffect } from "react";
import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { isDesktop, onLocalEvent } from "../../lib/desktop";

export const Route = createFileRoute("/_local")({
  ssr: false,
  beforeLoad: () => ({ desktopAvailable: isDesktop() }),
  component: LocalLayout,
});

function LocalLayout() {
  const router = useRouter();
  const { desktopAvailable } = Route.useRouteContext();
  useEffect(() => {
    if (!desktopAvailable) return;
    return onLocalEvent((event) => {
      if (
        event.event === "job.finished" ||
        (event.event === "engine.status" && event.data.status === "ready")
      )
        void router.invalidate({
          filter: (match) => match.routeId === "/_local/automations",
        });
    });
  }, [desktopAvailable, router]);
  return <Outlet />;
}
