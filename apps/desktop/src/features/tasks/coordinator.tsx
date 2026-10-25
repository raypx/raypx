import { useEffect, useRef } from "react";
import { apiUrl, authClient } from "../auth/client";
import { taskClient } from "./client";
import {
  getBridge,
  isDesktop,
  isDaemonDesktop,
  onLocalEvent,
  localRequest,
} from "../../lib/desktop";
import { localTaskClient } from "./local-client";

export function RemoteCoordinator() {
  const session = authClient.useSession();
  const accountId = session.data?.user.id;
  const previousAccount = useRef<string | null>(null);
  useEffect(() => {
    taskClient.setAccount?.(accountId ?? null);
    localTaskClient.setAccount(accountId ?? null);
    return () => {
      taskClient.setAccount?.(null);
      localTaskClient.setAccount(null);
    };
  }, [accountId]);
  useEffect(() => {
    if (!isDesktop() || session.isPending) return;
    // A missing/expired browser session is not an explicit daemon logout.
    if (isDaemonDesktop() && !accountId) return;
    const previous = previousAccount.current;
    previousAccount.current = accountId ?? null;
    if (previous && previous !== accountId)
      void localRequest("agents.local.detach", { accountId: previous }).catch(() => {});
    let active = true;
    let refreshing = false;
    const attach = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const bridge = await getBridge();
        await bridge.request.controlSession({ accountId: accountId ?? null });
        if (!active) return;
        if (!accountId) {
          await bridge.request.controlDetach({});
          return;
        }
        let info = await bridge.request.controlInfo({ accountId });
        if (info.pendingRevoke) {
          await taskClient.devices.revoke(info.pendingRevoke, {
            signal: AbortSignal.timeout(10_000),
          });
          info = await bridge.request.controlRevoked({ accountId });
        }
        if (!info.enabled || !active) return;
        if (info.daemon && info.authorized) return;
        await bridge.request.controlEnable({ accountId, enabled: true });
        const grant = info.binding
          ? await taskClient.devices.refreshGrant(info.binding, {
              signal: AbortSignal.timeout(10_000),
            })
          : await taskClient.devices.register(
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
    void attach();
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
    };
  }, [accountId, session.isPending]);
  return null;
}
