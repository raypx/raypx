import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import type { AgentCapability, DeviceProject } from "@raypx/contracts/tasks";
import { LOCAL_WORKSPACE_ID, type RootGrant } from "@raypx/contracts/local";
import type { ControlInfo } from "@raypx/contracts/terminal";
import {
  getBridge,
  isDesktop,
  hasTerminalHooks,
  localRequest,
  pickDirectory,
} from "../../lib/desktop";
import { authClient } from "../auth/client";
import { CloudTerminalSettings } from "./cloud-terminal-settings";
import { TerminalSettings } from "./terminal-settings";
import { ReauthorizeHost } from "./reauthorize";
import { RemoteBoundary } from "../auth/components/remote-boundary";
import { Link } from "@tanstack/react-router";

export function AgentSettings() {
  const t = useTranslations("tasks");
  const session = authClient.useSession();
  const accountId = session.isPending || session.error ? undefined : session.data?.user.id;
  const localText = useTranslations("localWorkspace");
  const [remoteInfo, setRemoteInfo] = useState<{
    account: string | undefined;
    value: ControlInfo | undefined;
  }>();
  const info = remoteInfo?.account === accountId ? remoteInfo?.value : undefined;
  const [roots, setRoots] = useState<RootGrant[]>([]);
  const [projects, setProjects] = useState<DeviceProject[]>([]);
  const [capabilities, setCapabilities] = useState<AgentCapability[]>([]);
  const [busy, setBusy] = useState(false);
  // "unavailable" comes from polling and clears on the next successful read.
  const [error, setError] = useState<"unavailable" | "local" | "remote" | false>(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const refresh = useCallback(async () => {
    if (!isDesktop()) return;
    const bridge = await getBridge();
    const [next, folders, configured, agents] = await Promise.all([
      accountId ? bridge.request.controlInfo({ accountId }) : Promise.resolve(undefined),
      localRequest("roots.list", {}),
      localRequest("agents.projects", {}),
      localRequest("agents.capabilities", {}),
    ]);
    setRemoteInfo({ account: accountId, value: next });
    setRoots(folders);
    setProjects(configured);
    setCapabilities(agents);
  }, [accountId]);
  useEffect(() => {
    let active = true;
    const read = () => {
      if (active)
        void refresh().then(
          () => {
            if (active) setError((value) => (value === "unavailable" ? false : value));
          },
          () => {
            if (active) setError("unavailable");
          },
        );
    };
    read();
    const timer = setInterval(read, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refresh]);
  async function change(action: () => Promise<unknown>, scope: "local" | "remote" = "local") {
    setBusy(true);
    setError(false);
    try {
      await action();
      window.dispatchEvent(new Event("raypx:remote-change"));
      await refresh();
    } catch {
      setError(scope);
    } finally {
      setBusy(false);
    }
  }
  if (!isDesktop()) return null;
  return (
    <section data-tasks className="mt-8 border-t border-border pt-7">
      <h2 className="text-base">{t("agentSettings")}</h2>
      <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{t("localSetupHint")}</p>
      <p className="mt-3 text-xs text-muted-foreground">{t("cliHint")}</p>
      <p className="mt-3 max-w-[65ch] text-sm text-muted-foreground">
        {localText("ownershipHint")}
      </p>
      <Link to="/welcome" className="mt-3 inline-block text-sm underline underline-offset-4">
        {localText("getStarted")}
      </Link>
      {info?.daemon && (
        <p className="mt-3 max-w-[65ch] text-sm text-muted-foreground">{t("daemonHint")}</p>
      )}
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
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium">{t("localHistory")}</h3>
          <p className="mt-1 max-w-[65ch] text-xs text-muted-foreground">{t("clearHistoryHint")}</p>
        </div>
        <Button
          variant={confirmClear ? "destructive" : "outline"}
          disabled={busy}
          onBlur={() => setConfirmClear(false)}
          onClick={() => {
            if (!confirmClear) return setConfirmClear(true);
            setConfirmClear(false);
            void change(() =>
              localRequest("agents.local.clear", { accountId: LOCAL_WORKSPACE_ID }),
            );
          }}
        >
          {t(confirmClear ? "confirmClearHistory" : "clearHistory")}
        </Button>
      </div>
      {(error === "unavailable" || error === "local") && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t("LOCAL_UNAVAILABLE")}
        </p>
      )}
      {hasTerminalHooks() && <TerminalSettings projects={projects} />}
      <div className="mt-8 border-t border-border pt-7">
        <RemoteBoundary>
          {() =>
            accountId && (
              <>
                <h3 className="text-base">{t("remoteTitle")}</h3>
                <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{t("remoteHint")}</p>
                <div className="my-5 flex flex-wrap items-center gap-4">
                  <Button
                    disabled={busy || !info}
                    variant={info?.enabled ? "outline" : "default"}
                    onClick={() =>
                      void change(
                        async () =>
                          (await getBridge()).request.controlEnable({
                            accountId,
                            enabled: !info?.enabled,
                          }),
                        "remote",
                      )
                    }
                  >
                    {t(info?.enabled ? "disconnect" : "connect")}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {t(info?.connected ? "online" : "offline")}
                  </span>
                </div>
                {(error === "remote" || info?.error) && (
                  <p role="alert" className="mt-3 text-sm text-destructive">
                    {t(
                      info?.error === "AUTH_REQUIRED" || info?.error === "UNAUTHORIZED"
                        ? "daemonAuthorizationRequired"
                        : "NETWORK_UNAVAILABLE",
                    )}
                  </p>
                )}
                {info?.daemon &&
                  (info.error === "AUTH_REQUIRED" || info.error === "UNAUTHORIZED") &&
                  session.data?.user.email && (
                    <ReauthorizeHost key={accountId} email={session.data.user.email} />
                  )}
                {info?.daemon && (
                  <CloudTerminalSettings
                    supported={info.terminalSupported !== false}
                    key={accountId}
                    accountId={accountId}
                    projects={projects}
                  />
                )}
              </>
            )
          }
        </RemoteBoundary>
      </div>
    </section>
  );
}
