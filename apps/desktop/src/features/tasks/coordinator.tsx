import { useEffect } from "react";
import { apiClient, apiUrl, authClient } from "../auth/client";
import { getBridge, isDesktop, onLocalEvent, localRequest } from "../../lib/desktop";
import { localTaskClient } from "./local-client";

export function RemoteCoordinator() {
  const session = authClient.useSession();
  const accountId = session.data?.user.id;
  useEffect(() => {
    apiClient.setAccount?.(accountId ?? null);
    localTaskClient.setAccount(accountId ?? null);
    return () => {
      apiClient.setAccount?.(null);
      localTaskClient.setAccount(null);
      if (accountId && isDesktop())
        void localRequest("agents.local.detach", { accountId }).catch(() => {});
    };
  }, [accountId]);
  useEffect(() => {
    if (!isDesktop() || session.isPending) return;
    let active = true;
    let refreshing = false;
    const attach = async () => {
      if (!accountId || refreshing) return;
      refreshing = true;
      try {
        const bridge = await getBridge();
        let info = await bridge.request.controlInfo({ accountId });
        if (info.pendingRevoke) {
          await apiClient.devices.revoke(info.pendingRevoke, {
            signal: AbortSignal.timeout(10_000),
          });
          info = await bridge.request.controlRevoked({ accountId });
        }
        if (!info.enabled || !active) return;
        await bridge.request.controlEnable({ accountId, enabled: true });
        const grant = info.binding
          ? await apiClient.devices.refreshGrant(info.binding, {
              signal: AbortSignal.timeout(10_000),
            })
          : await apiClient.devices.register(
              {
                installationId: info.installationId,
                name: info.name,
                platform: navigator.platform,
                appVersion: "0.1.0",
                reconnect: true,
              },
              { signal: AbortSignal.timeout(10_000) },
            );
        if (active) await bridge.request.controlAttach({ accountId, apiUrl, grant });
      } catch (error) {
        const code =
          error && typeof error === "object" && "data" in error
            ? (error as { data?: { error?: { code?: string } } }).data?.error?.code
            : undefined;
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "UNAUTHORIZED" &&
          active
        )
          await (await getBridge()).request.controlDetach({});
        if (code === "DEVICE_REVOKED" && accountId && active)
          await (await getBridge()).request.controlEnable({ accountId, enabled: false });
      } finally {
        refreshing = false;
      }
    };
    void getBridge()
      .then((bridge) => bridge.request.controlDetach({}))
      .then(attach)
      .catch(() => {});
    const stop = onLocalEvent((event) => {
      if (event.event === "sync.grantRequired") void attach();
    });
    // A native event renews short-lived credentials even when the window is hidden.
    const retry = () => void attach();
    window.addEventListener("online", retry);
    window.addEventListener("raypx:remote-change", retry);
    return () => {
      active = false;
      stop();
      window.removeEventListener("online", retry);
      window.removeEventListener("raypx:remote-change", retry);
      void getBridge()
        .then((bridge) => bridge.request.controlDetach({}))
        .catch(() => {});
    };
  }, [accountId, session.isPending]);
  return null;
}
