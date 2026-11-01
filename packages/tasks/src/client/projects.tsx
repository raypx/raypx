import type { ReactNode } from "react";
import type { TaskWorkspacePort } from "../model/port.js";
import { workspaceScopeKey, type WorkspaceScope } from "../model/scope.js";
import { useRemoteQuery } from "./remote-query.js";
import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { LoadingState } from "@raypx/ui/loading-state";
import { Folder } from "lucide-react";

/** Project selection is navigation only; it never creates work. */
export function ProjectList({
  client,
  scope,
  onSelect,
  connectionAction,
  compact = false,
}: {
  client: TaskWorkspacePort;
  scope: WorkspaceScope;
  onSelect: (target: { deviceId: string; projectId: string }) => void;
  connectionAction?: ReactNode;
  compact?: boolean;
}) {
  const t = useTranslations("tasks"),
    c = useTranslations("common");
  const load = useCallback((signal: AbortSignal) => client.devices.list({}, { signal }), [client]);
  const { data, error, refresh, refreshing } = useRemoteQuery(
    ["projects", workspaceScopeKey(scope)],
    load,
    true,
    client,
  );
  return (
    <section className={compact ? "space-y-2" : "space-y-6"} aria-label={t("connectedComputers")}>
      {!compact && (
        <header>
          <h1>{t("projectsTitle")}</h1>
          <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{t("projectEntryHint")}</p>
        </header>
      )}
      {!data && !error && <LoadingState label={c("loading")} />}
      {error && (
        <div role="alert">
          <p className="text-sm text-muted-foreground">{c("networkError")}</p>
          <Button variant="ghost" disabled={refreshing} onClick={refresh}>
            {c("retry")}
          </Button>
        </div>
      )}
      {data && !data.some((device) => !device.revoked && device.projects.length) && (
        <div className="space-y-3">
          <p className="max-w-[65ch] text-sm text-muted-foreground">{t("remoteProjectsEmpty")}</p>
          {connectionAction}
        </div>
      )}
      {data
        ?.filter((device) => !device.revoked)
        .map((device) => (
          <section key={device.id} className="space-y-2">
            <h2 className="text-sm font-medium">
              {device.name}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t(device.online ? "online" : "offline")}
              </span>
            </h2>
            <div className="flex flex-col gap-1">
              {device.projects.map((project) => (
                <Button
                  key={project.id}
                  variant="ghost"
                  className="h-auto min-h-10 justify-start gap-3 whitespace-normal text-left"
                  onClick={() => onSelect({ deviceId: device.id, projectId: project.id })}
                >
                  <Folder aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 break-words">{project.name}</span>
                </Button>
              ))}
            </div>
          </section>
        ))}
    </section>
  );
}

/** Resolve a session-only link through its authoritative project target. */
export function TaskProjectLink({
  client,
  scope,
  taskId,
  onSelect,
}: {
  client: TaskWorkspacePort;
  scope: WorkspaceScope;
  taskId: string;
  onSelect: (target: { deviceId: string; projectId: string }) => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) => client.tasks.get({ id: taskId }, { signal }),
    [client, taskId],
  );
  const { data, error, refresh } = useRemoteQuery(
    ["project-link", workspaceScopeKey(scope), taskId],
    load,
    true,
    client,
  );
  const sent = useRef("");
  const c = useTranslations("common");
  useEffect(() => {
    const key = JSON.stringify([workspaceScopeKey(scope), data?.task.id]);
    if (!data || sent.current === key) return;
    sent.current = key;
    onSelect({ deviceId: data.task.deviceId, projectId: data.task.projectId });
  }, [data, onSelect, scope]);
  return error ? (
    <div role="alert">
      <p>{c("error")}</p>
      <Button variant="outline" onClick={refresh}>
        {c("retry")}
      </Button>
    </div>
  ) : (
    <LoadingState label={c("loading")} />
  );
}
