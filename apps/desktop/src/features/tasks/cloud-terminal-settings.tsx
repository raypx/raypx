import { useEffect, useId, useState } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import type { DeviceProject } from "@raypx/contracts/tasks";
import { Button } from "@raypx/ui/components/ui/button";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Switch } from "@raypx/ui/components/ui/switch";
import { getBridge, localRequest } from "../../lib/desktop";

export function CloudTerminalSettings({
  accountId,
  projects,
  supported = true,
}: {
  accountId: string;
  projects: DeviceProject[];
  supported?: boolean;
}) {
  const t = useTranslations("tasks"),
    id = useId();
  const [value, setValue] = useState<{ enabled: boolean; rootIds: string[] }>();
  const [localRoots, setLocalRoots] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      getBridge().then((bridge) => bridge.request.terminalSettings({ accountId })),
      localRequest<{ rootIds: string[] }>("approvals.local.settings", {}),
    ]).then(
      ([settings, local]) => {
        if (active) {
          setValue(settings);
          setLocalRoots(local.rootIds);
        }
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [accountId]);
  const projectIds = projects
    .map((project) => project.id)
    .sort()
    .join(",");
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void localRequest<{ rootIds: string[] }>("approvals.local.settings", {}).then(
        (local) => {
          if (!active) return;
          setLocalRoots(local.rootIds);
          setValue((old) =>
            old
              ? { ...old, rootIds: old.rootIds.filter((root) => local.rootIds.includes(root)) }
              : old,
          );
        },
        () => {
          if (active) setError(true);
        },
      );
    };
    refresh();
    window.addEventListener("raypx:terminal-settings", refresh);
    return () => {
      active = false;
      window.removeEventListener("raypx:terminal-settings", refresh);
    };
  }, [accountId, projectIds]);
  return (
    <section className="mt-6 space-y-4" aria-labelledby={id}>
      <h4 id={id} className="text-sm font-medium">
        {t("terminalCloud")}
      </h4>
      <p className="max-w-[65ch] text-sm text-muted-foreground">{t("terminalCloudHint")}</p>
      {!supported && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("terminalServerUpgrade")}
        </p>
      )}
      {value && (
        <>
          <label className="flex items-center justify-between gap-4 text-sm">
            {t("terminalCloud")}
            <Switch
              checked={value.enabled}
              disabled={busy || !supported}
              onCheckedChange={(enabled) => setValue({ ...value, enabled })}
            />
          </label>
          {projects
            .filter((project) => localRoots.includes(project.id))
            .map((project) => (
              <label key={project.id} className="flex min-h-9 items-center gap-3 text-sm">
                <Checkbox
                  checked={value.rootIds.includes(project.id)}
                  disabled={busy || !supported}
                  onCheckedChange={(checked) =>
                    setValue({
                      ...value,
                      rootIds: checked
                        ? [...value.rootIds, project.id]
                        : value.rootIds.filter((root) => root !== project.id),
                    })
                  }
                />
                {project.name}
              </label>
            ))}
          <Button
            disabled={busy || !supported}
            onClick={() => {
              setBusy(true);
              setError(false);
              void getBridge()
                .then((bridge) =>
                  bridge.request.terminalConfigure({
                    accountId,
                    ...value,
                    rootIds: value.rootIds.filter((root) => localRoots.includes(root)),
                  }),
                )
                .then(setValue, () => setError(true))
                .finally(() => setBusy(false));
            }}
          >
            {t("terminalSave")}
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {t("terminalActionFailed")}
        </p>
      )}
    </section>
  );
}
