import { useTranslations } from "./i18n.js";
import {
  useCallback,
  useState,
  type ComponentType,
  type MouseEventHandler,
  type ReactNode,
} from "react";

import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { FolderIcon } from "@raypx/icons/folder";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@raypx/ui/components/ui/sidebar";
import type { TaskWorkspacePort } from "../model/port.js";
import { workspaceScopeKey, type WorkspaceScope } from "../model/scope.js";
import { sessionThreads } from "../model/session-threads.js";
import { useRemoteQuery } from "./remote-query.js";
import { TaskStatusMark } from "./task-status.js";

const pageSize = 30;
const collapsedCount = 5;

/**
 * Applications adapt their router link to the project's page, or to one of its sessions
 * when `taskId` is set. Only an exact location match may mark a link current, so the
 * project entry does not stay highlighted while one of its sessions is open.
 */
export interface SessionLinkProps {
  projectId: string;
  deviceId: string;
  taskId?: string | undefined;
  className?: string | undefined;
  "aria-current"?: "page" | undefined;
  /** Forwarded from the sidebar primitives; adapters call it with the event. */
  onClick?: MouseEventHandler<HTMLAnchorElement> | undefined;
  children?: ReactNode;
}

interface GroupProps {
  client: TaskWorkspacePort;
  scope: WorkspaceScope;
  projectId: string;
  deviceId: string;
  name: string;
  /** The project's page or one of its sessions is open. */
  current: boolean;
  activeTaskId?: string | undefined;
  /** Expanded before the person toggles it; the current project always starts expanded. */
  defaultOpen?: boolean;
  SessionLink: ComponentType<SessionLinkProps>;
}

/**
 * A project entry in the sidebar with its recent conversations beneath it, newest first.
 * The entry opens the project's page (composer and full history); the chevron only folds
 * the list, which loads while expanded and follows live task changes.
 */
export function ProjectSessionGroup({
  name,
  current,
  activeTaskId,
  defaultOpen = false,
  SessionLink,
  ...source
}: GroupProps) {
  const { projectId, deviceId } = source;
  const t = useTranslations("tasks");
  const [toggled, setToggled] = useState<boolean>();
  const open = toggled ?? (current || defaultOpen);
  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setToggled}>
        <SidebarMenuButton
          tooltip={name}
          className="min-h-control-lg gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-foreground [&_svg]:size-5"
          render={
            <SessionLink
              projectId={projectId}
              deviceId={deviceId}
              aria-current={current && !activeTaskId ? "page" : undefined}
            />
          }
        >
          <FolderIcon aria-hidden="true" className="shrink-0 stroke-[1.75]" />
          <span className="truncate">{name}</span>
        </SidebarMenuButton>
        <CollapsibleTrigger
          render={
            <SidebarMenuAction
              showOnHover
              aria-label={t(open ? "hideSessions" : "showSessions", { project: name })}
              className="text-muted-foreground peer-data-[size=default]/menu-button:top-2 data-panel-open:[&>svg]:rotate-90 [&>svg]:transition-transform motion-reduce:[&>svg]:transition-none"
            />
          }
        >
          <ChevronRightIcon aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ProjectSessions {...source} activeTaskId={activeTaskId} SessionLink={SessionLink} />
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

function ProjectSessions({
  client,
  scope,
  projectId,
  deviceId,
  activeTaskId,
  SessionLink,
}: Pick<
  GroupProps,
  "client" | "scope" | "projectId" | "deviceId" | "activeTaskId" | "SessionLink"
>) {
  const t = useTranslations("tasks");
  const [expanded, setExpanded] = useState(false);
  const load = useCallback(
    (signal: AbortSignal) =>
      client.tasks.list({ limit: pageSize, projectId, deviceId }, { signal }),
    [client, projectId, deviceId],
  );
  const { data, error } = useRemoteQuery(
    ["sidebar-sessions", workspaceScopeKey(scope), deviceId, projectId],
    load,
    true,
    client,
  );
  if (!data && error)
    return (
      <p className="py-1 pr-2 pl-10 text-xs text-muted-foreground">{t("sessionsUnavailable")}</p>
    );
  if (!data) return <SidebarMenuSkeleton aria-hidden="true" className="ml-8 h-7" />;
  const threads = sessionThreads(data);
  if (!threads.length)
    return <p className="py-1 pr-2 pl-10 text-xs text-muted-foreground">{t("noSessionsYet")}</p>;
  const visible = expanded ? threads : threads.slice(0, collapsedCount);
  return (
    <SidebarMenuSub className="mr-0 ml-5 gap-0.5 pr-0">
      {visible.map((thread) => {
        const active = activeTaskId !== undefined && thread.taskIds.has(activeTaskId);
        return (
          <SidebarMenuSubItem key={thread.root.id}>
            <SidebarMenuSubButton
              className="h-7 text-[0.8125rem] text-muted-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
              render={
                <SessionLink
                  projectId={projectId}
                  deviceId={deviceId}
                  taskId={thread.latest.id}
                  aria-current={active ? "page" : undefined}
                />
              }
            >
              <span className="min-w-0 flex-1 truncate">{thread.root.prompt}</span>
              <TaskStatusMark status={thread.latest.status} />
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        );
      })}
      {threads.length > collapsedCount && (
        <SidebarMenuSubItem>
          <SidebarMenuSubButton
            render={(props) => <button type="button" {...props} />}
            className="h-7 w-full text-xs text-muted-foreground"
            onClick={() => setExpanded((value) => !value)}
          >
            {t(expanded ? "showFewerSessions" : "showMoreSessions")}
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      )}
    </SidebarMenuSub>
  );
}
