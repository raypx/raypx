import { memo, type ReactNode, type RefObject, type ComponentProps } from "react";
import { AgentIcon } from "@raypx/icons/agent";
import { Button } from "@raypx/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@raypx/ui/components/ui/tooltip";
import { cn } from "@raypx/ui/lib/utils";
import type { AgentConversationView } from "../model/port.js";
import { agentIdentityStyle } from "./identity.js";

export const AgentDirectoryList = memo(function AgentDirectoryList({
  entries,
  selectedId,
  rowClass,
  rowButtons,
  actions,
}: {
  entries: readonly AgentConversationView[];
  selectedId: string | null;
  rowClass: string;
  rowButtons: RefObject<Map<string, HTMLElement>>;
  actions: RefObject<{
    choose: (item: AgentConversationView) => void;
    menu: (item: AgentConversationView) => ReactNode;
  }>;
}) {
  return (
    <ul className="flex min-w-0 flex-col gap-0.5">
      {entries.map((item) => (
        <li
          key={item.agent.id}
          className={cn(
            "group/directory-row flex min-w-0 items-center rounded-lg",
            item.agent.id === selectedId && "bg-selected text-selected-text",
          )}
        >
          <DirectoryButton
            ref={(node) => {
              if (node) rowButtons.current.set(item.agent.id, node);
              else rowButtons.current.delete(item.agent.id);
            }}
            size="sm"
            variant="ghost"
            className={cn(rowClass, "flex-1")}
            aria-label={item.agent.name}
            title={item.agent.name}
            aria-current={item.agent.id === selectedId ? "page" : undefined}
            onClick={() => actions.current.choose(item)}
          >
            <AgentIcon
              data-icon="inline-start"
              aria-hidden="true"
              className="size-5 rounded-md p-0.5"
              style={agentIdentityStyle(item.agent.id, true)}
            />
            <span className="min-w-0 flex-1 truncate text-left sidebar-icon:hidden">
              {item.agent.name}
            </span>
          </DirectoryButton>
          {actions.current.menu(item)}
        </li>
      ))}
    </ul>
  );
});
function DirectoryButton({ children, ...props }: ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button {...props} />}>{children}</TooltipTrigger>
      <TooltipContent side="right">{props["aria-label"]}</TooltipContent>
    </Tooltip>
  );
}
