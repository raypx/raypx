import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import type { AgentCapability, DeviceProject } from "@raypx/contracts/tasks";
import type { RootGrant } from "@raypx/contracts/local";
import type { ControlInfo } from "../../../native/control";
import { getBridge, isDesktop, localRequest, pickDirectory } from "../../lib/desktop";
import { authClient } from "../auth/client";

export function RemoteSettings() {
  const t = useTranslations("tasks");
  const session = authClient.useSession();
  const accountId = session.data?.user.id;
  const [info, setInfo] = useState<ControlInfo>();
  const [roots, setRoots] = useState<RootGrant[]>([]);
  const [projects, setProjects] = useState<DeviceProject[]>([]);
  const [capabilities, setCapabilities] = useState<AgentCapability[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    if (!accountId || !isDesktop()) return;
    const bridge = await getBridge();
    const [next, folders, configured, agents] = await Promise.all([
      bridge.request.controlInfo({ accountId }),
      localRequest<RootGrant[]>("roots.list", {}),
      localRequest<DeviceProject[]>("agents.projects", {}),
      localRequest<AgentCapability[]>("agents.capabilities", {}),
    ]);
    setInfo(next);
    setRoots(folders);
    setProjects(configured);
    setCapabilities(agents);
  }, [accountId]);
  useEffect(() => {
    let active = true;
    const read = () => {
      if (active)
        void refresh().catch(() => {
          if (active) setError(true);
        });
    };
    read();
    const timer = setInterval(read, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refresh]);
  async function change(action: () => Promise<unknown>) {
    setBusy(true);
    setError(false);
    try {
      await action();
      window.dispatchEvent(new Event("raypx:remote-change"));
      await refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  if (!accountId || !isDesktop()) return null;
  return (
    <section data-tasks className="mt-8 border-t border-border pt-7">
      <h2 className="text-base">{t("remoteTitle")}</h2>
      <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{t("remoteHint")}</p>
      <div className="my-5 flex flex-wrap items-center gap-4">
        <Button
          disabled={busy || !info}
          variant={info?.enabled ? "outline" : "default"}
          onClick={() =>
            void change(async () =>
              (await getBridge()).request.controlEnable({ accountId, enabled: !info?.enabled }),
            )
          }
        >
          {t(info?.enabled ? "disconnect" : "connect")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t(info?.connected ? "online" : "offline")}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{t("cliHint")}</p>
      <ul className="mt-3 space-y-2">
        {capabilities.map((capability) => (
          <li key={capability.provider} className="flex flex-wrap gap-3 text-sm">
            <span>{capability.provider === "claude" ? "Claude Code" : "Codex"}</span>
            <span className="text-muted-foreground">
              {capability.version} · {t(capability.reason)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center justify-between">
        <h3 className="text-sm font-medium">{t("projects")}</h3>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void change(async () => {
              const root = await pickDirectory();
              if (root)
                await localRequest("agents.configure", {
                  rootId: root.id,
                  providers: ["claude", "codex"],
                });
            })
          }
        >
          {t("authorize")}
        </Button>
      </div>
      {!roots.length && <p className="mt-3 text-sm text-muted-foreground">{t("noProjects")}</p>}
      {roots.map((root) => (
        <div
          key={root.id}
          className="flex items-center justify-between gap-4 border-b border-border py-4"
        >
          <span className="min-w-0 text-sm [overflow-wrap:anywhere]">{root.name}</span>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void change(() =>
                localRequest("agents.configure", {
                  rootId: root.id,
                  providers: projects.some((project) => project.id === root.id)
                    ? []
                    : ["claude", "codex"],
                }),
              )
            }
          >
            {t(
              projects.some((project) => project.id === root.id)
                ? "disableProject"
                : "enableProject",
            )}
          </Button>
        </div>
      ))}
      {(error || info?.error) && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t("NETWORK_UNAVAILABLE")}
        </p>
      )}
    </section>
  );
}
