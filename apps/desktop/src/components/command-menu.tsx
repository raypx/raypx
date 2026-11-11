import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { CommandPalette, type CommandGroup } from "@raypx/blocks/command-palette";
import { useTranslations } from "@raypx/i18n/browser";
import { AgentIcon } from "@raypx/icons/agent";
import { FolderIcon } from "@raypx/icons/folder";
import { PlusIcon } from "@raypx/icons/plus";
import { SettingsIcon } from "@raypx/icons/settings";
import { sessionThreads } from "@raypx/tasks/model";
import { apiUrl } from "../features/auth/client.js";
import { localTaskClient } from "../features/tasks/local-client.js";
import { useProjectCatalog } from "../features/tasks/project-catalog.js";
import { rememberProject } from "../features/tasks/project-history.js";
import { isDesktop } from "../lib/desktop.js";

type DesktopPage = "/" | "/approvals" | "/automations" | "/memory";
const recentLimit = 8;

/** Desktop's ⌘K search over actions, pages, this computer's projects and recent sessions. */
export function DesktopCommandMenu({
  open,
  onOpenChange,
  pages,
  onSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: readonly { to: DesktopPage; label: string; icon: ReactNode }[];
  onSettings: () => void;
}) {
  const router = useRouter();
  const c = useTranslations("common");
  const t = useTranslations("tasks");
  const local = open && isDesktop();
  const catalog = useProjectCatalog(local);
  const sessions = useQuery({
    queryKey: ["command-sessions", apiUrl, "local"],
    queryFn: ({ signal }) => localTaskClient.tasks.list({ limit: 30 }, { signal }),
    enabled: local,
    staleTime: 10_000,
    retry: false,
  });
  const device = catalog.data?.[0];
  const projects = device?.projects ?? [];
  function openProject(projectId: string, taskId?: string) {
    if (!device) return;
    rememberProject(projectId);
    void router.navigate({
      to: "/tasks",
      search: {
        scope: "local",
        project: projectId,
        device: device.id,
        ...(taskId ? { taskId } : {}),
      },
    });
  }
  const groups: CommandGroup[] = [
    {
      label: c("actions"),
      items: [
        {
          id: "new-session",
          label: c("newSession"),
          icon: <PlusIcon />,
          onSelect: () =>
            void router.navigate({ to: "/tasks", search: { scope: "local", compose: true } }),
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
      items: projects.map((project) => ({
        id: `project:${project.id}`,
        label: project.name,
        icon: <FolderIcon />,
        onSelect: () => openProject(project.id),
      })),
    },
    {
      label: c("recentSessions"),
      items: sessionThreads(sessions.data ?? [])
        .slice(0, recentLimit)
        .map(({ root, latest }) => ({
          id: `session:${root.id}`,
          label: root.prompt,
          detail:
            projects.find((project) => project.id === latest.projectId)?.name ?? t(latest.status),
          icon: <AgentIcon />,
          onSelect: () => openProject(latest.projectId, latest.id),
        })),
    },
  ];
  return <CommandPalette open={open} onOpenChange={onOpenChange} groups={groups} />;
}
