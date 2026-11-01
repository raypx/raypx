import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { Folder } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@raypx/ui/components/ui/sidebar";
import { taskClient } from "./client";
import { apiUrl } from "../auth/client";

export function RemoteProjectNavigation({ accountId }: { accountId: string | null }) {
  const t = useTranslations("tasks"),
    queries = useQueryClient();
  const key = ["desktop-remote-projects", apiUrl, accountId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => taskClient.devices.list({}, { signal }),
    enabled: Boolean(accountId),
    retry: false,
  });
  useEffect(() => {
    if (!accountId) return;
    return taskClient.subscribe(
      () =>
        void queries.invalidateQueries({
          queryKey: ["desktop-remote-projects", apiUrl, accountId],
        }),
    );
  }, [accountId, queries]);
  return (
    <SidebarGroup className="p-0 sidebar-icon:hidden">
      <SidebarGroupLabel className="px-3">{t("connectedComputers")}</SidebarGroupLabel>
      <SidebarMenu>
        {data
          ?.filter((device) => !device.revoked)
          .map((device) => (
            <SidebarMenuItem key={device.id}>
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {device.name} · {t(device.online ? "online" : "offline")}
              </p>
              {device.projects.map((project) => (
                <SidebarMenuButton
                  key={project.id}
                  className="min-h-10 gap-3 px-3"
                  render={
                    <Link
                      to="/tasks"
                      search={{ scope: "remote", device: device.id, project: project.id }}
                    />
                  }
                >
                  <Folder aria-hidden="true" />
                  <span className="truncate">{project.name}</span>
                </SidebarMenuButton>
              ))}
            </SidebarMenuItem>
          ))}
        <SidebarMenuItem>
          <SidebarMenuButton
            className="min-h-10 px-3 text-muted-foreground"
            render={<Link to="/tasks" search={{ scope: "remote" }} />}
          >
            {t("remoteProjectEntry")}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
