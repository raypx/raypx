import { useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button } from "@raypx/ui/components/ui/button";
import { IconButton } from "@raypx/ui/icon-button";
import { ClockIcon } from "@raypx/icons/clock";
import { BookOpenIcon } from "@raypx/icons/book-open";
import { MonitorIcon } from "@raypx/icons/monitor";
import { CapabilitySheet } from "./capability-sheet.js";
import { MoreHorizontalIcon } from "@raypx/icons/more-horizontal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@raypx/ui/components/ui/dropdown-menu";
import { RoutinesPanel } from "@raypx/jobs/client";
import { SpaceMemoryPanel } from "@raypx/memory/client";
import type { AgentsWorkspacePort, AgentConversationView } from "../model.js";
import { useTranslations } from "./i18n.js";

/** Panels preserve conversation width and unmount editors (including secrets) on close. */
export function CapabilityPanels({
  item,
  client,
  accountId,
  onOpenRun,
  onOpen,
  onOpenComputer,
  menuTrigger,
  workspace = false,
  contextTarget,
  onEditAgent,
  onDeleteAgent,
}: {
  item: AgentConversationView;
  client: Pick<AgentsWorkspacePort, "routines" | "spaceMemory">;
  accountId: string;
  origin: string;
  onOpenRun: (id: string) => void;
  onOpen: () => void;
  onOpenComputer?: ((opener: HTMLButtonElement | null) => void) | undefined;
  menuTrigger?: RefObject<HTMLButtonElement | null> | undefined;
  workspace?: boolean;
  contextTarget?: HTMLElement | null | undefined;
  onEditAgent?: (() => void) | undefined;
  onDeleteAgent?: (() => void) | undefined;
}) {
  const t = useTranslations("agents");
  const [panel, setPanel] = useState<"routines" | "memory" | null>(null);
  const routineTrigger = useRef<HTMLButtonElement>(null);
  const memoryTrigger = useRef<HTMLButtonElement>(null);
  const localMenuTrigger = useRef<HTMLButtonElement>(null);
  const overflowTrigger = menuTrigger ?? localMenuTrigger;
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const lastFromMenu = useRef(false);
  const lastKind = useRef<"routines" | "memory">("routines");
  function open(kind: "routines" | "memory", fromMenu = false) {
    lastKind.current = kind;
    lastFromMenu.current = fromMenu;
    if (fromMenu) lastTrigger.current = overflowTrigger.current;
    else lastTrigger.current = kind === "routines" ? routineTrigger.current : memoryTrigger.current;
    onOpen();
    setPanel(kind);
  }
  const label = panel === "routines" ? t("routines") : t("spaceMemory");
  let contents: ReactNode = null;
  if (panel === "routines" && client.routines)
    contents = (
      <RoutinesPanel
        showTitle={false}
        spaceId={item.agent.spaceId}
        agentId={item.agent.id}
        accountId={accountId}
        port={client.routines}
        onOpenRun={(id) => {
          lastTrigger.current = null;
          setPanel(null);
          onOpenRun(id);
        }}
      />
    );
  if (panel === "memory" && client.spaceMemory)
    contents = (
      <SpaceMemoryPanel
        showTitle={false}
        spaceId={item.agent.spaceId}
        agentId={item.agent.id}
        client={client.spaceMemory}
      />
    );
  return (
    <>
      {!workspace && (
        <div
          data-capability-inline
          className="hidden shrink-0 flex-row flex-nowrap items-center gap-1 sm:flex"
        >
          {client.routines && (
            <IconButton
              ref={routineTrigger}
              size="icon-sm"
              className="shrink-0"
              label={t("routines")}
              onClick={() => open("routines")}
            >
              <ClockIcon aria-hidden="true" />
            </IconButton>
          )}
          {client.spaceMemory && (
            <IconButton
              ref={memoryTrigger}
              size="icon-sm"
              className="shrink-0"
              label={t("spaceMemory")}
              onClick={() => open("memory")}
            >
              <BookOpenIcon aria-hidden="true" />
            </IconButton>
          )}
        </div>
      )}
      {contextTarget &&
        createPortal(
          <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-border/60 p-2">
            {client.routines && (
              <Button
                ref={routineTrigger}
                variant="ghost"
                className="justify-start"
                onClick={() => open("routines")}
              >
                <ClockIcon data-icon="inline-start" aria-hidden="true" />
                {t("routines")}
              </Button>
            )}
            {client.spaceMemory && (
              <Button
                ref={memoryTrigger}
                variant="ghost"
                className="justify-start"
                onClick={() => open("memory")}
              >
                <BookOpenIcon data-icon="inline-start" aria-hidden="true" />
                {t("spaceMemory")}
              </Button>
            )}
          </div>,
          contextTarget,
        )}
      {(client.routines ||
        client.spaceMemory ||
        onOpenComputer ||
        onEditAgent ||
        onDeleteAgent) && (
        <div className={workspace ? "shrink-0" : "shrink-0 sm:hidden"}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <IconButton
                  ref={overflowTrigger}
                  data-capability-menu
                  size="icon-sm"
                  className="shrink-0"
                  label={t(workspace ? "conversationActions" : "capabilityMenu")}
                />
              }
            >
              <MoreHorizontalIcon aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {client.routines && (
                  <DropdownMenuItem onClick={() => open("routines", true)}>
                    <ClockIcon aria-hidden="true" />
                    {t("routines")}
                  </DropdownMenuItem>
                )}
                {client.spaceMemory && (
                  <DropdownMenuItem onClick={() => open("memory", true)}>
                    <BookOpenIcon aria-hidden="true" />
                    {t("spaceMemory")}
                  </DropdownMenuItem>
                )}
                {onOpenComputer && (
                  <DropdownMenuItem onClick={() => onOpenComputer(overflowTrigger.current)}>
                    <MonitorIcon aria-hidden="true" />
                    {t("computerTitle")}
                  </DropdownMenuItem>
                )}
                {onEditAgent && (
                  <DropdownMenuItem onClick={onEditAgent}>{t("editAgent")}</DropdownMenuItem>
                )}
                {onDeleteAgent && (
                  <DropdownMenuItem variant="destructive" onClick={onDeleteAgent}>
                    {t("deleteAgent")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <CapabilitySheet
        open={panel !== null}
        onClose={() => setPanel(null)}
        title={label}
        closeLabel={t("closePanel")}
        finalFocus={() => {
          if (!lastTrigger.current) return false;
          // The viewport may change while a sheet is open. Return to its visible opener.
          const inline = window.matchMedia?.("(min-width: 640px)").matches ?? true;
          if (!inline || (workspace && (!contextTarget || lastFromMenu.current)))
            return overflowTrigger.current ?? false;
          const target =
            lastKind.current === "routines" ? routineTrigger.current : memoryTrigger.current;
          return target ?? false;
        }}
        className="w-[calc(100vw-1rem)] max-w-2xl data-[side=right]:w-[calc(100vw-1rem)] data-[side=right]:sm:max-w-2xl"
      >
        {contents}
      </CapabilitySheet>
    </>
  );
}
