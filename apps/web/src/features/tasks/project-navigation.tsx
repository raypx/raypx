import { useTranslations } from "../../i18n.js";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";

import { ProjectSessionGroup, type SessionLinkProps } from "@raypx/tasks/client";
import { cn } from "@raypx/ui/lib/utils";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@raypx/ui/components/ui/sidebar";
import { taskClient } from "./client.js";
import { apiUrl } from "../auth/client.js";

/** Authorized computers and their projects; the sidebar and the command palette share it. */
export function remoteProjectsQuery(accountId: string) {
  return {
    queryKey: ["remote-projects", apiUrl, accountId],
    queryFn: ({ signal }: { signal: AbortSignal }) => taskClient.devices.list({}, { signal }),
    retry: false,
  } as const;
}

function SessionLink({ projectId, deviceId, taskId, ...props }: SessionLinkProps) {
  return (
    <Link
      to="/tasks"
      search={{ device: deviceId, project: projectId, ...(taskId ? { taskId } : {}) }}
      activeOptions={{ exact: true }}
      {...props}
    />
  );
}

/** Signed-in projects grouped by computer, each with its recent sessions. */
export function RemoteProjectNavigation({ accountId }: { accountId: string }) {
  const t = useTranslations("tasks"),
    queries = useQueryClient();
  const { pathname, searchStr } = useLocation();
  const search = new URLSearchParams(searchStr);
  const onTasks = pathname === "/tasks";
  const active = onTasks ? `${search.get("device")}:${search.get("project")}` : null;
  const activeTaskId = (onTasks && search.get("taskId")) || undefined;
  const scope = { kind: "remote", namespace: apiUrl, accountId } as const;
  const { data } = useQuery(remoteProjectsQuery(accountId));
  useEffect(
    () =>
      taskClient.subscribe(
        () =>
          void queries.invalidateQueries({
            queryKey: ["remote-projects", apiUrl, accountId],
          }),
      ),
    [accountId, queries],
  );
  const devices = data?.filter((device) => !device.revoked && device.projects.length) ?? [];
  if (!devices.length) return null;
  return (
    <SidebarGroup className="p-0 sidebar-icon:hidden" aria-label={t("connectedComputers")}>
      <SidebarGroupLabel className="mb-1 h-auto px-3">{t("connectedComputers")}</SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {devices.map((device, deviceIndex) => (
          <SidebarMenuItem key={device.id}>
            <p className="flex items-center gap-2 px-3 pt-1 pb-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  device.online ? "bg-foreground" : "bg-muted-foreground/40",
                )}
              />
              <span className="truncate">{device.name}</span>
              <span className="sr-only">{t(device.online ? "online" : "offline")}</span>
            </p>
            <SidebarMenu className="gap-1">
              {device.projects.map((project, index) => {
                const current = active === `${device.id}:${project.id}`;
                return (
                  <ProjectSessionGroup
                    key={project.id}
                    client={taskClient}
                    scope={scope}
                    projectId={project.id}
                    deviceId={device.id}
                    name={project.name}
                    current={current}
                    activeTaskId={current ? activeTaskId : undefined}
                    defaultOpen={deviceIndex === 0 && index === 0}
                    SessionLink={SessionLink}
                  />
                );
              })}
            </SidebarMenu>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
