import { Activity, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { EmptyState } from "@raypx/ui/empty-state";
import { desktopRecovery, authClient } from "../client.js";
import { useTranslations } from "../../../i18n.js";

export function DeploymentBoundary({ children }: { children: ReactNode }) {
  const connection = useSyncExternalStore(
    desktopRecovery.subscribe,
    desktopRecovery.getSnapshot,
    ready,
  );
  const queryClient = useQueryClient();
  const router = useRouter();
  const previous = useRef(connection);
  const t = useTranslations("localWorkspace");
  useEffect(() => {
    if (connection === "ready" && previous.current === "updating") {
      authClient.$store.notify("$sessionSignal");
      void queryClient.invalidateQueries();
      void router.invalidate();
    }
    previous.current = connection;
  }, [connection, queryClient, router]);
  return (
    <>
      {connection === "updating" && (
        <main className="flex min-h-dvh items-center justify-center p-4" role="status">
          <EmptyState
            headingLevel={1}
            title={t("deploymentUpdating")}
            description={t("deploymentRecovery")}
          />
        </main>
      )}
      <Activity mode={connection === "updating" ? "hidden" : "visible"}>{children}</Activity>
    </>
  );
}
function ready() {
  return "ready" as const;
}
