import { useTranslations } from "../i18n.js";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { CommandPalette, type CommandGroup } from "@raypx/blocks/command-palette";

import { AgentIcon } from "@raypx/icons/agent";
import { FolderIcon } from "@raypx/icons/folder";
import { PlusIcon } from "@raypx/icons/plus";
import { SettingsIcon } from "@raypx/icons/settings";
import { sessionThreads } from "@raypx/tasks/model";
import { useTaskStatusLabel } from "@raypx/tasks/client/status";
import type { WebPath } from "../features/auth/access.js";
import { apiUrl } from "../features/auth/client.js";
import { taskClient } from "../features/tasks/client.js";
import { remoteProjectsQuery } from "../features/tasks/project-navigation.js";

const recentLimit = 8;

/** Web's ⌘K search: actions, pages, the account's projects and its recent sessions. */
export function WebCommandMenu({
  open,
  onOpenChange,
  accountId,
  pages,
  onSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Projects and sessions appear only for accounts that may read projects. */
  accountId: string | null;
  pages: readonly { to: WebPath; label: string; icon: ReactNode }[];
  onSettings: () => void;
}) {
  const router = useRouter();
  const c = useTranslations("common");
  const taskStatus = useTaskStatusLabel();
  const projects = useQuery({
    ...remoteProjectsQuery(accountId ?? ""),
    enabled: open && Boolean(accountId),
  });
  const sessions = useQuery({
    queryKey: ["command-sessions", apiUrl, accountId],
    queryFn: ({ signal }) => taskClient.tasks.list({ limit: 30 }, { signal }),
    enabled: open && Boolean(accountId),
    staleTime: 10_000,
    retry: false,
  });
  const devices = (accountId && projects.data?.filter((device) => !device.revoked)) || [];
  const projectName = (deviceId: string, projectId: string) =>
    devices
      .find((device) => device.id === deviceId)
      ?.projects.find((project) => project.id === projectId)?.name;
  const groups: CommandGroup[] = [
    {
      label: c("actions"),
      items: [
        {
          id: "new-session",
          label: c("newSession"),
          icon: <PlusIcon />,
          onSelect: () => void router.navigate({ to: "/tasks", search: { compose: true } }),
        },
        { id: "settings", label: c("settings"), icon: <SettingsIcon />, onSelect: onSettings },
      ],
    },
    {
      label: c("pages"),
      items: pages.map((page) => ({
        id: `page:${page.to}`,
        label: page.label,
        icon: page.icon,
        onSelect: () => void router.navigate({ to: page.to }),
      })),
    },
    {
      label: c("projects"),
      items: devices.flatMap((device) =>
        device.projects.map((project) => ({
          id: `project:${device.id}:${project.id}`,
          label: project.name,
          detail: device.name,
          icon: <FolderIcon />,
          onSelect: () =>
            void router.navigate({
              to: "/tasks",
              search: { device: device.id, project: project.id },
            }),
        })),
      ),
    },
    {
      label: c("recentSessions"),
      items: accountId
        ? sessionThreads(sessions.data ?? [])
            .slice(0, recentLimit)
            .map(({ root, latest }) => ({
              id: `session:${root.id}`,
              label: root.prompt,
              detail: projectName(latest.deviceId, latest.projectId) ?? taskStatus(latest.status),
              icon: <AgentIcon />,
              onSelect: () =>
                void router.navigate({
                  to: "/tasks",
                  search: { device: latest.deviceId, project: latest.projectId, taskId: latest.id },
                }),
            }))
        : [],
    },
  ];
  return <CommandPalette open={open} onOpenChange={onOpenChange} groups={groups} />;
}
