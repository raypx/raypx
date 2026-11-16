import { Activity, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { apiIngressVersion } from "@raypx/contracts/api";
import { isMissingProcedure, originRecovery } from "@raypx/client/api";
import { apiOrigin } from "../../origins.js";
import { authClient } from "../auth/client.js";
import { EmptyState } from "@raypx/ui/empty-state";
import { useTranslations } from "../../i18n.js";
import { publicConfigurationQuery } from "./client.js";

/** Keep drafts mounted while a breaking ingress rollout converges. */
export function DeploymentBoundary({ children }: { children: ReactNode }) {
  const query = useQuery(publicConfigurationQuery());
  const queryClient = useQueryClient();
  const recovery = typeof window === "undefined" ? undefined : originRecovery(apiOrigin());
  const connection = useSyncExternalStore(
    recovery?.subscribe ?? subscribeNothing,
    recovery?.getSnapshot ?? ready,
    ready,
  );
  const previousConnection = useRef(connection);
  const router = useRouter();
  const t = useTranslations("site");
  const updating =
    (query.data !== undefined && query.data.ingressVersion !== apiIngressVersion) ||
    isMissingProcedure(query.error) ||
    connection === "updating";
  const previous = useRef(updating);
  useEffect(() => {
    if (connection === "ready" && previousConnection.current === "updating") {
      void queryClient.invalidateQueries();
      authClient.$store.notify("$sessionSignal");
    }
    previousConnection.current = connection;
  }, [connection, queryClient]);
  useEffect(() => {
    if (previous.current && !updating) void router.invalidate();
    previous.current = updating;
  }, [updating, router]);
  return (
    <>
      {updating && (
        <main className="flex min-h-dvh items-center justify-center p-4" role="status">
          <EmptyState
            headingLevel={1}
            title={t("deploymentUpdating")}
            description={t("deploymentRecovery")}
          />
        </main>
      )}
      <Activity mode={updating ? "hidden" : "visible"}>{children}</Activity>
    </>
  );
}
function ready() {
  return "ready" as const;
}
function subscribeNothing() {
  return () => {};
}
