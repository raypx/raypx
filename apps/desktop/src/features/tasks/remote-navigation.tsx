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
  SidebarMenuButton,
  SidebarMenuItem,
} from "@raypx/ui/components/ui/sidebar";
import { taskClient } from "./client.js";
import { apiUrl } from "../auth/client.js";

function SessionLink({ projectId, deviceId, taskId, ...props }: SessionLinkProps) {
  return (
    <Link
      to="/tasks"
      search={{
        scope: "remote",
        device: deviceId,
        project: projectId,
        ...(taskId ? { taskId } : {}),
      }}
      activeOptions={{ exact: true }}
      {...props}
    />
  );
}

/** Projects on the account's other computers, each with its recent sessions. */
export function RemoteProjectNavigation({ accountId }: { accountId: string }) {
  const t = useTranslations("tasks"),
    queries = useQueryClient();
  const search = useLocation({ select: (location) => new URLSearchParams(location.searchStr) });
  const remote = search.get("scope") === "remote";
  const active = remote ? `${search.get("device")}:${search.get("project")}` : null;
  const activeTaskId = (remote && search.get("taskId")) || undefined;
  const scope = { kind: "remote", namespace: apiUrl, accountId } as const;
  const key = ["desktop-remote-projects", apiUrl, accountId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => taskClient.devices.list({}, { signal }),
    retry: false,
  });
  useEffect(
    () =>
      taskClient.subscribe(
        () =>
          void queries.invalidateQueries({
            queryKey: ["desktop-remote-projects", apiUrl, accountId],
          }),
      ),
    [accountId, queries],
  );
  return (
    <SidebarGroup className="p-0 sidebar-icon:hidden" aria-label={t("connectedComputers")}>
      <SidebarGroupLabel className="mb-1 h-auto px-3">{t("connectedComputers")}</SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {data
          ?.filter((device) => !device.revoked)
          .map((device) => (
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
                {device.projects.map((project) => {
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
                      SessionLink={SessionLink}
                    />
                  );
                })}
              </SidebarMenu>
            </SidebarMenuItem>
          ))}
        <SidebarMenuItem>
          <SidebarMenuButton
            className="min-h-9 px-3 text-xs text-muted-foreground"
            render={<Link to="/tasks" search={{ scope: "remote" }} />}
          >
            {t("remoteProjectEntry")}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
