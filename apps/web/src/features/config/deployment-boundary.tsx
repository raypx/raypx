import { Activity, useEffect, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { apiIngressVersion } from "@raypx/contracts/api";
import { isMissingProcedure } from "@raypx/client/api";
import { EmptyState } from "@raypx/ui/empty-state";
import { useTranslations } from "../../i18n.js";
import { publicConfigurationQuery } from "./client.js";

/** Keep drafts mounted while a breaking ingress rollout converges. */
export function DeploymentBoundary({ children }: { children: ReactNode }) {
  const query = useQuery(publicConfigurationQuery());
  const router = useRouter();
  const t = useTranslations("site");
  const updating =
    (query.data !== undefined && query.data.ingressVersion !== apiIngressVersion) ||
    isMissingProcedure(query.error);
  const previous = useRef(updating);
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
