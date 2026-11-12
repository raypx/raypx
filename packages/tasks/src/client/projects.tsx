import { useTranslations } from "./i18n.js";
import { agentProviderMetadata } from "@raypx/core/tasks";
import type { ReactNode } from "react";
import type { TaskWorkspacePort } from "../model/port.js";
import { workspaceScopeKey, type WorkspaceScope } from "../model/scope.js";
import { useRemoteQuery } from "./remote-query.js";
import { useCallback, useEffect, useId, useRef } from "react";

import { Button } from "@raypx/ui/components/ui/button";
import { LoadingState } from "@raypx/ui/loading-state";
import { EmptyState } from "@raypx/ui/empty-state";
import { cn } from "@raypx/ui/lib/utils";
import { FolderIcon } from "@raypx/icons/folder";
import { GitBranchIcon } from "@raypx/icons/git-branch";
import { LaptopIcon } from "@raypx/icons/laptop";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { DevicesIcon } from "@raypx/icons/devices";

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
  const id = useId();
  const load = useCallback((signal: AbortSignal) => client.devices.list({}, { signal }), [client]);
  const { data, error, refresh, refreshing } = useRemoteQuery(
    ["projects", workspaceScopeKey(scope)],
    load,
    true,
    client,
  );
  return (
    <section
      className={compact ? "flex flex-col gap-2" : "flex flex-col gap-6"}
      aria-label={t("connectedComputers")}
    >
      {!compact && (
        <header>
          <h1>{c("projects")}</h1>
          <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">{t("projectEntryHint")}</p>
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
      {data &&
        !data.some((device) => !device.revoked && device.projects.length) &&
        (compact ? (
          <div className="space-y-3">
            <p className="max-w-[65ch] text-sm text-muted-foreground">{t("remoteProjectsEmpty")}</p>
            {connectionAction}
          </div>
        ) : (
          <EmptyState
            className="py-10"
            icon={<DevicesIcon aria-hidden="true" />}
            title={t("noRemoteProjects")}
            description={t("remoteProjectsEmpty")}
            action={connectionAction}
          />
        ))}
      {data
        ?.filter((device) => !device.revoked)
        .map((device) => (
          <section
            key={device.id}
            className={compact ? "flex flex-col gap-2" : "flex flex-col gap-2"}
          >
            <h2 className="flex items-center gap-2 text-sm font-medium">
              {!compact && (
                <LaptopIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              )}
              <span className="min-w-0 truncate">{device.name}</span>
              <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 rounded-full",
                    device.online ? "bg-foreground" : "bg-muted-foreground/40",
                  )}
                />
                {t(device.online ? "online" : "offline")}
              </span>
            </h2>
            {compact ? (
              <div className="flex flex-col gap-1">
                {device.projects.map((project) => (
                  <Button
                    key={project.id}
                    variant="ghost"
                    className="h-auto min-h-10 justify-start gap-3 whitespace-normal text-left"
                    onClick={() => onSelect({ deviceId: device.id, projectId: project.id })}
                  >
                    <FolderIcon aria-hidden="true" className="shrink-0" />
                    <span className="min-w-0 break-words">{project.name}</span>
                  </Button>
                ))}
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {device.projects.map((project) => {
                  const key = `${id}-${device.id}-${project.id}`;
                  return (
                    <li key={project.id}>
                      <Button
                        variant="ghost"
                        aria-labelledby={`${key}-name`}
                        aria-describedby={`${key}-meta`}
                        className="h-auto w-full items-center justify-start gap-3 rounded-none p-3 text-left whitespace-normal"
                        onClick={() => onSelect({ deviceId: device.id, projectId: project.id })}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          <FolderIcon aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span id={`${key}-name`} className="block font-medium break-words">
                            {project.name}
                          </span>
                          <span
                            id={`${key}-meta`}
                            className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs font-normal text-muted-foreground"
                          >
                            <span>
                              {project.providers
                                .map((provider) => agentProviderMetadata[provider].label)
                                .join(" · ")}
                            </span>
                            {project.dirty && (
                              <span className="flex items-center gap-1">
                                <GitBranchIcon aria-hidden="true" className="size-3" />
                                {t("uncommitted")}
                              </span>
                            )}
                          </span>
                        </span>
                        <ChevronRightIcon
                          aria-hidden="true"
                          className="shrink-0 text-muted-foreground"
                        />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
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
