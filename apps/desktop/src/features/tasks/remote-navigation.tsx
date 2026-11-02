import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { FolderIcon } from "@raypx/icons/folder";
import { cn } from "@raypx/ui/lib/utils";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@raypx/ui/components/ui/sidebar";
import { taskClient } from "./client";
import { apiUrl } from "../auth/client";

export function RemoteProjectNavigation({ accountId }: { accountId: string }) {
  const t = useTranslations("tasks"),
    queries = useQueryClient();
  const search = useLocation({ select: (location) => new URLSearchParams(location.searchStr) });
  const active =
    search.get("scope") === "remote" ? `${search.get("device")}:${search.get("project")}` : null;
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
              {device.projects.map((project) => (
                <SidebarMenuButton
                  key={project.id}
                  className="min-h-10 gap-3 rounded-lg px-3 text-[13px] text-muted-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-foreground [&_svg]:size-5"
                  render={
                    <Link
                      to="/tasks"
                      search={{ scope: "remote", device: device.id, project: project.id }}
                      aria-current={active === `${device.id}:${project.id}` ? "page" : undefined}
                    />
                  }
                >
                  <FolderIcon aria-hidden="true" className="shrink-0 stroke-[1.75]" />
                  <span className="truncate">{project.name}</span>
                </SidebarMenuButton>
              ))}
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
