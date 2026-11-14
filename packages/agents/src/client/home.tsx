import { AttachmentDrafts, useAttachmentFiles } from "./attachments.js";
import type { MessageAttachmentsPort } from "../model/attachments.js";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type Ref } from "react";
import type { ApprovalMode } from "@raypx/core/approvals";
import { Logo } from "@raypx/ui/logo";
import { Button } from "@raypx/ui/components/ui/button";
import { IconButton } from "@raypx/ui/icon-button";
import { InputGroupTextarea } from "@raypx/ui/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@raypx/ui/components/ui/dropdown-menu";
import { AgentIcon } from "@raypx/icons/agent";
import { MonitorIcon } from "@raypx/icons/monitor";
import { PlusIcon } from "@raypx/icons/plus";
import { SendIcon } from "@raypx/icons/send";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import {
  ComputerController,
  ConversationController,
  type AgentConversationView,
  type ApprovalPort,
  type ComputerPort,
  type ConversationDraftStore,
  type ConversationPort,
  type ConversationSocketPort,
  type OfferedModel,
} from "../model.js";
import { ComposerCard } from "./composer-card.js";
import { CapabilitySheet } from "./capability-sheet.js";
import { ComputerPanel } from "./computer.js";
import { useTranslations } from "./i18n.js";
import { DeviceComputersController, type DeviceComputersPort } from "../model/device-computers.js";

const computerStatusKeys = {
  loading: "loading",
  "not-configured": "computerNotConfigured",
  stopped: "computerStopped",
  destroyed: "computerStopped",
  starting: "computerStarting",
  running: "computerRunning",
  stopping: "computerStopping",
  failed: "computerFailed",
} as const;

export function WorkspaceHome({
  agents,
  targetId,
  onTargetChange,
  onOpen,
  onEdit,
  models,
  mode,
  port,
  computerPort,
  deviceComputers,
  messageAttachments,
  approvalPort,
  drafts,
  socket,
  accountId,
  origin,
  publicOrigin,
  onOpenExternal,
  onCreateAgent,
  createAgentRef,
}: {
  agents: readonly AgentConversationView[];
  targetId: string | null;
  onTargetChange: (id: string) => void;
  onOpen: (item: AgentConversationView) => void;
  onEdit: (item: AgentConversationView) => void;
  models: readonly OfferedModel[];
  mode?: ApprovalMode | undefined;
  port: ConversationPort;
  computerPort: ComputerPort;
  deviceComputers?: DeviceComputersPort | undefined;
  messageAttachments?: MessageAttachmentsPort | undefined;
  approvalPort?: ApprovalPort | undefined;
  drafts: ConversationDraftStore;
  socket: ConversationSocketPort;
  accountId: string;
  origin: string;
  publicOrigin: string;
  onOpenExternal?: ((url: string) => void) | undefined;
  onCreateAgent?: (() => void) | undefined;
  createAgentRef?: Ref<HTMLButtonElement> | undefined;
}) {
  const t = useTranslations("agents");
  const item = agents.find((entry) => entry.agent.id === targetId) ?? agents[0];
  const emptyContent = onCreateAgent ? (
    <Button ref={createAgentRef} onClick={onCreateAgent} className="self-center">
      <PlusIcon data-icon="inline-start" aria-hidden="true" />
      {t("createAgent")}
    </Button>
  ) : (
    <span>{t("workspaceHome.createHint")}</span>
  );
  return (
    <div data-workspace-home className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 px-4 pb-14 sm:px-8">
        <div className="flex flex-col items-center gap-5 text-center">
          <Logo label="Raypx" aria-hidden="true" className="[&>span]:hidden [&>img]:size-9" />
          <h1 className="text-xl font-medium tracking-tight sm:text-2xl">
            {t("workspaceHome.heading")}
          </h1>
        </div>
        {item ? (
          <HomeComposer
            key={JSON.stringify([origin, accountId, item.conversation.id])}
            item={item}
            agents={agents}
            onTargetChange={onTargetChange}
            onOpen={onOpen}
            onEdit={() => onEdit(item)}
            modelName={
              models.find((model) => model.modelId === item.agent.model.modelId)?.name ??
              item.agent.model.modelId
            }
            mode={mode}
            port={port}
            computerPort={computerPort}
            deviceComputers={deviceComputers}
            messageAttachments={messageAttachments}
            supportsImages={
              models.find((model) => model.modelId === item.agent.model.modelId)?.supportsImages ===
              true
            }
            approvalPort={approvalPort}
            drafts={drafts}
            socket={socket}
            accountId={accountId}
            origin={origin}
          />
        ) : (
          <div className="flex w-full max-w-150 flex-col rounded-3xl border border-border/60 bg-background p-5 text-sm text-muted-foreground shadow-sm">
            {emptyContent}
          </div>
        )}
      </div>
      <footer className="flex shrink-0 justify-center gap-4 px-4 py-4 text-xs text-muted-foreground">
        <a
          className="inline-flex items-center justify-center rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          onClick={(event) => {
            if (onOpenExternal) {
              event.preventDefault();
              onOpenExternal(`${publicOrigin}/privacy`);
            }
          }}
          href={`${publicOrigin}/privacy`}
          target="_blank"
          rel="noreferrer"
        >
          {t("workspaceHome.privacy")}
        </a>
        <a
          className="inline-flex items-center justify-center rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          onClick={(event) => {
            if (onOpenExternal) {
              event.preventDefault();
              onOpenExternal("https://github.com/raypx/raypx");
            }
          }}
          href="https://github.com/raypx/raypx"
          target="_blank"
          rel="noreferrer"
        >
          {t("workspaceHome.help")}
        </a>
      </footer>
    </div>
  );
}

interface HomeComposerProps {
  item: AgentConversationView;
  agents: readonly AgentConversationView[];
  onTargetChange: (id: string) => void;
  onOpen: (item: AgentConversationView) => void;
  onEdit: () => void;
  modelName: string;
  supportsImages: boolean;
  mode?: ApprovalMode | undefined;
  port: ConversationPort;
  computerPort: ComputerPort;
  deviceComputers?: DeviceComputersPort | undefined;
  messageAttachments?: MessageAttachmentsPort | undefined;
  approvalPort?: ApprovalPort | undefined;
  drafts: ConversationDraftStore;
  socket: ConversationSocketPort;
  accountId: string;
  origin: string;
}

function HomeComposer(props: HomeComposerProps) {
  const {
    item,
    computerPort,
    deviceComputers,
    messageAttachments,
    approvalPort,
    origin,
    accountId,
    port,
    socket,
    drafts,
  } = props;
  const [controllers, setControllers] = useState<{
    computer: ComputerController;
    conversation: ConversationController;
    devices: DeviceComputersController | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let computer: ComputerController | undefined;
    let conversation: ConversationController | undefined;
    let devices: DeviceComputersController | undefined;
    queueMicrotask(() => {
      if (cancelled) return;
      computer = new ComputerController(item.agent.spaceId, computerPort, { accountId, socket });
      conversation = new ConversationController({
        computer,
        ...(messageAttachments ? { attachments: messageAttachments } : {}),
        ...(approvalPort ? { approvals: approvalPort } : {}),
        selection: { spaceId: item.agent.spaceId, conversationId: item.conversation.id },
        owner: { origin, accountId },
        port,
        socket,
        drafts,
        key: () => crypto.randomUUID(),
      });
      if (deviceComputers) {
        devices = new DeviceComputersController(
          item.agent.spaceId,
          deviceComputers,
          item.conversation.id,
        );
        void devices.refresh();
      }
      setControllers({ computer, conversation, devices: devices ?? null });
      void computer.refresh();
    });
    return () => {
      cancelled = true;
      conversation?.dispose();
      computer?.dispose();
      devices?.dispose();
    };
  }, [
    item.agent.spaceId,
    item.conversation.id,
    computerPort,
    deviceComputers,
    messageAttachments,
    approvalPort,
    origin,
    accountId,
    port,
    socket,
    drafts,
  ]);
  if (!controllers) return <div className="h-36 w-full max-w-150" />;
  return <HomeComposerView {...props} controllers={controllers} />;
}

function HomeComposerView({
  item,
  agents,
  onTargetChange,
  onOpen,
  onEdit,
  modelName,
  mode,
  controllers,
  supportsImages,
}: HomeComposerProps & {
  controllers: {
    computer: ComputerController;
    conversation: ConversationController;
    devices: DeviceComputersController | null;
  };
}) {
  const t = useTranslations("agents");
  const { computer, conversation, devices } = controllers;
  const deviceState = useSyncExternalStore(
    devices?.subscribe ?? subscribeNoDevices,
    devices?.getSnapshot ?? noDevices,
    devices?.getSnapshot ?? noDevices,
  );
  const selectedDevice = deviceState?.devices.find(
    (device) => device.id === deviceState.selection?.deviceId,
  );
  const state = useSyncExternalStore(
    conversation.subscribe,
    conversation.getSnapshot,
    conversation.getSnapshot,
  );
  const computerState = useSyncExternalStore(
    computer.subscribe,
    computer.getSnapshot,
    computer.getSnapshot,
  );
  const attachmentFiles = useAttachmentFiles(conversation.attachments, supportsImages);
  const [computerOpen, setComputerOpen] = useState(false);
  const computerTrigger = useRef<HTMLButtonElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const options = useMemo(
    () => agents.map((entry) => ({ value: entry.agent.id, label: entry.agent.name })),
    [agents],
  );
  useEffect(() => {
    if (computerState.status !== "starting" && computerState.status !== "stopping") return;
    const timer = setInterval(() => void computer.refresh(), 1_000);
    return () => clearInterval(timer);
  }, [computer, computerState.status]);
  async function send() {
    const accepted = state.pending ? await conversation.sendPending() : await conversation.send();
    if (accepted) onOpen(item);
    else editor.current?.focus();
  }
  const activeComputer =
    Boolean(deviceState?.selection) ||
    computerState.status === "running" ||
    computerState.status === "starting";
  const deviceSelectionKnown = !deviceState || (!deviceState.loading && !deviceState.error);
  let status = t(computerStatusKeys[computerState.status]);
  if (deviceState?.selection)
    status = `${selectedDevice?.name ?? t("devices.unavailable")} · ${t(selectedDevice?.connected ? "devices.connected" : "devices.offline")}`;
  else if (deviceState?.loading) status = t("loading");
  else if (deviceState?.error) status = t("computerUnavailable");
  const appliedMode = mode ?? state.effectiveMode?.mode;
  return (
    <form
      className="flex w-full max-w-150 min-w-0 flex-col gap-3"
      onPasteCapture={attachmentFiles.onPaste}
      onDragOverCapture={attachmentFiles.onDragOver}
      onDropCapture={attachmentFiles.onDrop}
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <ComposerCard
        attachments={
          <AttachmentDrafts
            controller={conversation.attachments}
            files={attachmentFiles}
            disabled={state.sending || state.pending !== null}
          />
        }
        toolbar={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <IconButton type="button" label={t("workspaceHome.context")} size="icon-sm" />
                }
              >
                <PlusIcon aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={!conversation.attachments || state.pending !== null}
                    onClick={() => attachmentFiles.choose()}
                  >
                    {t("attachments.add")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onEdit}>
                    <AgentIcon aria-hidden="true" />
                    {t("editAgent")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setComputerOpen(true)}>
                    <MonitorIcon aria-hidden="true" />
                    {t("computerTitle")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex min-w-0 items-center rounded-full bg-muted/70 p-0.5">
              <Select
                items={options}
                value={item.agent.id}
                disabled={state.sending || state.pending !== null}
                onValueChange={(value) => {
                  if (value) onTargetChange(value);
                }}
              >
                <SelectTrigger
                  size="sm"
                  aria-label={t("workspaceHome.target")}
                  title={item.agent.name}
                  className="min-w-0 max-w-44 rounded-full border-0 shadow-none sm:max-w-52"
                >
                  <AgentIcon aria-hidden="true" />
                  <SelectValue className="min-w-0">
                    <span className="min-w-0 flex-1 truncate">{item.agent.name}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  <SelectGroup>
                    {agents.map((entry) => (
                      <SelectItem
                        key={entry.agent.id}
                        value={entry.agent.id}
                        data-value={entry.agent.id}
                      >
                        {entry.agent.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                ref={computerTrigger}
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full px-2 text-xs"
                aria-pressed={activeComputer}
                aria-label={t("computerIndicator", { state: status })}
                title={status}
                disabled={
                  deviceState?.busy ||
                  (deviceSelectionKnown &&
                    !deviceState?.selection &&
                    (computerState.status === "loading" ||
                      (!devices && computerState.status === "not-configured") ||
                      computerState.pending !== null ||
                      computerState.status === "stopping"))
                }
                onClick={() => {
                  if (
                    deviceSelectionKnown &&
                    !deviceState?.selection &&
                    (computerState.status === "stopped" || computerState.status === "failed")
                  )
                    void computer.start();
                  else setComputerOpen(true);
                }}
              >
                <MonitorIcon data-icon="inline-start" aria-hidden="true" />
                <span className="hidden sm:inline">{t("workspaceHome.computer")}</span>
              </Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto min-w-0 max-w-40 gap-1 rounded-full px-2 text-xs"
                    aria-label={t("workspaceHome.modelMenu")}
                  />
                }
              >
                <span className="min-w-0 truncate">{modelName}</span>
                <ChevronDownIcon aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={!conversation.attachments || state.pending !== null}
                    onClick={() => attachmentFiles.choose()}
                  >
                    {t("attachments.add")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onEdit}>{t("editAgent")}</DropdownMenuItem>
                  {appliedMode && (
                    <DropdownMenuItem disabled>
                      {t(`approvalSettings.${appliedMode}`)}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <IconButton
              type="submit"
              label={state.sending ? t("sending") : t("send")}
              size="icon"
              variant="default"
              className="rounded-full"
              disabled={
                (!state.draft.trim() &&
                  !attachmentFiles.items.some((draft) => draft.state === "ready")) ||
                state.sending ||
                attachmentFiles.items.some((draft) => draft.state !== "ready")
              }
            >
              <SendIcon aria-hidden="true" />
            </IconButton>
          </>
        }
      >
        <InputGroupTextarea
          ref={editor}
          aria-label={t("message")}
          placeholder={t("workspaceHome.placeholder")}
          className="max-h-48 min-h-24 px-4 pt-4 pb-2 text-base leading-6"
          value={state.draft}
          disabled={state.pending !== null}
          onChange={(event) => conversation.setDraft(event.target.value)}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.nativeEvent.isComposing ||
              composing.current ||
              event.keyCode === 229
            )
              return;
            event.preventDefault();
            void send();
          }}
        />
      </ComposerCard>
      {state.pending && (
        <p role="status" className="px-2 text-xs text-muted-foreground">
          {t("pendingDelivery")}{" "}
          <Button
            type="button"
            size="xs"
            variant="link"
            disabled={state.sending}
            onClick={() => void send()}
          >
            {t("retryDelivery")}
          </Button>
        </p>
      )}
      {state.error && (
        <p role="alert" className="px-2 text-sm text-muted-foreground">
          {t(state.error === "storage" ? "storageError" : "sendError")}
        </p>
      )}
      {state.sendCode && (
        <p role="alert" className="px-2 text-sm text-muted-foreground">
          {t(state.sendCode)}
        </p>
      )}
      <CapabilitySheet
        open={computerOpen}
        onClose={() => setComputerOpen(false)}
        title={t("computerTitle")}
        closeLabel={t("close")}
        finalFocus={() => computerTrigger.current ?? false}
        className="w-full sm:max-w-lg"
      >
        {computerOpen && (
          <ComputerPanel
            controller={computer}
            devices={devices}
            deviceSelected={Boolean(deviceState?.selection)}
            sheet
            onClose={() => setComputerOpen(false)}
          />
        )}
      </CapabilitySheet>
    </form>
  );
}

function subscribeNoDevices() {
  return () => {};
}
function noDevices() {
  return null;
}
