import { useTranslations } from "../../i18n.js";
import { agentProviderMetadata } from "@raypx/core/tasks";
import type { LocalResult } from "@raypx/contracts/local-client";
import { useEffect, useId, useState, useRef } from "react";
import type { DeviceProject } from "@raypx/contracts/tasks";
import { useFormatter } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Switch } from "@raypx/ui/components/ui/switch";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { SelectField } from "@raypx/ui/select-field";
import { useConfirmation } from "@raypx/ui/confirmation";
import { localRequest } from "../../lib/desktop.js";

type Settings = LocalResult<"approvals.local.settings">;
type Connector = LocalResult<"connectors.status">[number];
const errorKeys = {
  INSTALLATION_BUSY: "hook.busy",
  EACCES: "hook.permission",
  EPERM: "hook.permission",
  HOST_DOWNGRADE: "hook.downgrade",
  UNSUPPORTED_PLATFORM: "hook.unsupported",
  COMPILED_CLI_REQUIRED: "hook.unsupported",
  INSTALLATION_CONFLICT: "hook.binaryConflict",
  HOST_UPDATE_REQUIRED: "hook.desktopRequired",
  INSTALLATION_TIMEOUT: "hook.timeout",
} as const;
function failureKey(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : error instanceof Error
        ? /^(?:Error: )?([A-Z_]+)(?::|$)/.exec(error.message)?.[1]
        : undefined;
  return code && Object.hasOwn(errorKeys, code)
    ? errorKeys[code as keyof typeof errorKeys]
    : "settings.failed";
}
export function TerminalSettings({ projects }: { projects: DeviceProject[] }) {
  const format = useFormatter();
  const t = useTranslations("terminal"),
    approval = useTranslations("tasks.terminalApproval"),
    c = useTranslations("common"),
    id = useId();
  const [settings, setSettings] = useState<Settings>(),
    [connectors, setConnectors] = useState<Connector[]>([]);
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<
      ReturnType<typeof failureKey> | "tasks.terminalApproval.unavailable" | null
    >(null),
    [saved, setSaved] = useState(false);
  const { confirm, dialog } = useConfirmation();
  const operation = useRef(false),
    confirming = useRef(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      localRequest("approvals.local.settings", {}),
      localRequest("connectors.status", {}),
    ]).then(
      ([value, hooks]) => {
        if (active) {
          setSettings(value);
          setConnectors(hooks);
          setDirty(false);
        }
      },
      () => {
        if (active) setError("tasks.terminalApproval.unavailable");
      },
    );
    return () => {
      active = false;
    };
  }, []);
  const update = (next: Partial<Settings>) => {
    setSettings((old) => (old ? { ...old, ...next } : old));
    setDirty(true);
    setSaved(false);
  };
  async function action(run: () => Promise<unknown>, save = false) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await run();
      setConnectors(await localRequest("connectors.status", {}));
      if (save) {
        setDirty(false);
        setSaved(true);
        window.dispatchEvent(new Event("raypx:terminal-settings"));
      }
    } catch (caught) {
      setError(failureKey(caught));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function recover(connector: Connector) {
    if (operation.current || confirming.current) return;
    confirming.current = true;
    try {
      if (
        await confirm({
          requestKey: `repair:${connector.provider}`,
          title: t("hook.replace"),
          description: t("hook.replaceHint"),
          confirmLabel: t("hook.replaceConfirm"),
          cancelLabel: c("cancel"),
        })
      )
        await action(() =>
          localRequest("connectors.install", {
            provider: connector.provider,
            recoverModified: true,
          }),
        );
    } finally {
      confirming.current = false;
    }
  }
  const unavailable = false;
  const durations = [
    ...new Set([
      ...Array.from({ length: 10 }, (_, index) => (index + 1) * 60),
      settings?.waitSeconds ?? 300,
    ]),
  ].sort((a, b) => a - b);
  return (
    <section aria-labelledby={`${id}-title`} className="mt-8 border-t border-border pt-7">
      <h3 id={`${id}-title`} className="text-base font-semibold">
        {t("settings.title")}
      </h3>
      <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{t("settings.hint")}</p>
      <ul className="mt-4 divide-y divide-border">
        {connectors.map((connector) => (
          <li
            key={connector.provider}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div>
              <p className="text-sm font-medium">
                {agentProviderMetadata[connector.provider].label}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(connector.installed ? "hook.installed" : "hook.notInstalled")}
              </p>
              {connector.settingsFile && (
                <p className="mt-1 max-w-[65ch] break-all font-mono text-xs text-muted-foreground">
                  {connector.settingsFile}
                </p>
              )}
              {(connector.modified || connector.error) && (
                <p className="mt-1 max-w-[65ch] text-xs text-destructive-text">
                  {t(
                    connector.error === "HOOK_SETTINGS_SYMLINK"
                      ? "hook.symlink"
                      : ["HOST_BINARY_MISSING", "HOST_BINARY_NOT_EXECUTABLE"].includes(
                            connector.error ?? "",
                          )
                        ? "hook.repairHint"
                        : "hook.settingsConflict",
                  )}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {connector.repairable && !connector.modified ? (
                <Button variant="outline" disabled={busy} onClick={() => void recover(connector)}>
                  {t("hook.replace")}
                </Button>
              ) : (
                (!connector.installed || connector.updateAvailable) && (
                  <Button
                    disabled={
                      busy ||
                      connector.modified ||
                      Boolean(
                        connector.error &&
                        !["HOST_BINARY_MISSING", "HOST_BINARY_NOT_EXECUTABLE"].includes(
                          connector.error,
                        ),
                      )
                    }
                    variant="outline"
                    onClick={() =>
                      void action(() =>
                        localRequest("connectors.install", { provider: connector.provider }),
                      )
                    }
                  >
                    {t(
                      connector.updateAvailable
                        ? "hook.update"
                        : connector.hookInstalled
                          ? "hook.repair"
                          : "hook.install",
                    )}
                  </Button>
                )
              )}
              {(connector.hookInstalled ?? connector.installed) && (
                <Button
                  disabled={busy || connector.modified}
                  variant="outline"
                  onClick={() =>
                    void action(() =>
                      localRequest("connectors.uninstall", { provider: connector.provider }),
                    )
                  }
                >
                  {t("hook.uninstall")}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 max-w-[65ch] text-xs text-muted-foreground">{t("hook.trust")}</p>
      {settings && (
        <div className="mt-6 space-y-5">
          <div className="flex items-start justify-between gap-5">
            <div className="space-y-1">
              <label htmlFor={`${id}-away`} className="text-sm font-medium">
                {t("settings.away")}
              </label>
              <p className="max-w-[65ch] text-sm text-muted-foreground">{t("settings.awayHint")}</p>
            </div>
            <Switch
              id={`${id}-away`}
              checked={settings.away}
              onCheckedChange={(away) => update({ away })}
              disabled={busy || unavailable}
            />
          </div>
          <div className="max-w-xs space-y-2">
            <label htmlFor={`${id}-wait`} className="text-sm font-medium">
              {t("settings.wait")}
            </label>
            <SelectField
              id={`${id}-wait`}
              value={String(settings.waitSeconds)}
              options={durations.map((seconds) => ({
                value: String(seconds),
                label: format.number(seconds / 60, {
                  style: "unit",
                  unit: "minute",
                  unitDisplay: "long",
                }),
              }))}
              disabled={busy || unavailable}
              onValueChange={(value) => update({ waitSeconds: Number(value) })}
            />
          </div>
          {!projects.length && (
            <p className="text-sm text-muted-foreground">{t("settings.noProjects")}</p>
          )}
          <div className="space-y-3">
            {projects.map((project) => (
              <label key={project.id} className="flex min-h-9 items-center gap-3 text-sm">
                <Checkbox
                  checked={settings.rootIds.includes(project.id)}
                  disabled={busy || unavailable}
                  onCheckedChange={(checked) =>
                    update({
                      rootIds: checked
                        ? [...settings.rootIds, project.id]
                        : settings.rootIds.filter((value) => value !== project.id),
                    })
                  }
                />
                <span className="min-w-0 wrap-anywhere">
                  {t("settings.project", { name: project.name })}
                </span>
              </label>
            ))}
          </div>
          <Button
            disabled={busy || !dirty || unavailable}
            onClick={() =>
              void action(
                () =>
                  localRequest("approvals.local.configure", {
                    away: settings.away,
                    waitSeconds: settings.waitSeconds,
                    rootIds: settings.rootIds.filter((root) =>
                      projects.some((project) => project.id === root),
                    ),
                  }),
                true,
              )
            }
          >
            {busy ? c("loading") : t("settings.save")}
          </Button>
        </div>
      )}
      {saved && (
        <p role="status" className="mt-3 text-sm">
          {t("settings.saved")}
        </p>
      )}
      {error && (
        <div className="mt-3 space-y-2">
          <p role="alert" className="text-sm text-destructive-text">
            {error === "tasks.terminalApproval.unavailable" ? approval("unavailable") : t(error)}
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const next = await localRequest("approvals.local.settings", {});
                if (!dirty) setSettings(next);
              })
            }
          >
            {c("refreshStatus")}
          </Button>
        </div>
      )}
      {dialog}
    </section>
  );
}
