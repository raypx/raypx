import { AttachmentPicker, useAttachmentDrafts } from "./attachments.js";
import logoMark from "@raypx/ui/logo-mark.webp";
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentRef } from "react";
import { Button } from "heroui-native/button";
import { TextArea } from "heroui-native/text-area";
import { Image, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from "react-native";
import {
  MAX_CONVERSATION_DRAFT,
  type AgentConversationView,
  type ComputerController,
  type DeviceComputersController,
  type ConversationController,
  type OfferedModel,
} from "@raypx/agents/model";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";
import { Choice } from "./directory.js";
import { ComputerIndicator, ComputerSheet } from "./computer-sheet.js";
import { useDeviceComputerView } from "./device-computers.js";

/** This composer uses the selected conversation's scoped draft and delivery receipt. */
export function AgentHome({
  item,
  agents,
  models,
  focusVersion = 0,
  controller,
  computer,
  devices,
  onSelect,
  onOpen,
  onEdit,
  onContext,
}: {
  item: AgentConversationView;
  focusVersion?: number;
  agents: readonly AgentConversationView[];
  models: readonly OfferedModel[];
  controller: ConversationController;
  computer: ComputerController;
  devices?: DeviceComputersController | undefined;
  onSelect(this: void, id: string): void;
  onOpen(this: void): void;
  onEdit(this: void): void;
  onContext(this: void): void;
}) {
  const { t } = useCopy();
  const attachmentDrafts = useAttachmentDrafts(controller.attachments);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const computerState = useSyncExternalStore(
    computer.subscribe,
    computer.getSnapshot,
    computer.getSnapshot,
  );
  const deviceState = useDeviceComputerView(devices);
  const editor = useRef<ComponentRef<typeof TextArea>>(null);
  useEffect(() => {
    if (focusVersion) editor.current?.focus();
  }, [focusVersion]);
  const [computerOpen, setComputerOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const errorKeys = {
    load: "agents.loadError",
    send: "agents.sendError",
    stop: "agents.stopError",
    storage: "agents.storageError",
  } as const;
  const selectedModel =
    models.find((entry) => entry.modelId === item.agent.model.modelId)?.name ??
    item.agent.model.modelId;
  function openComputer() {
    setComputerOpen(true);
    if (
      (!devices || (!deviceState.loading && !deviceState.error)) &&
      !deviceState.selection &&
      ["stopped", "destroyed", "failed"].includes(computerState.status)
    )
      void computer.start();
  }
  async function send() {
    if (await controller.send()) onOpen();
  }
  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerClassName="grow justify-center gap-6 px-4 pb-12"
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-[600px] self-center gap-6">
          <View className="items-center gap-4">
            <Image source={logoMark} accessibilityLabel="Raypx" className="size-10" />
            <Text
              accessibilityRole="header"
              className="text-center text-2xl font-medium text-foreground"
            >
              {t("mobile.homeQuestion")}
            </Text>
          </View>
          <View className="gap-3 rounded-3xl border border-border bg-background p-3 shadow-sm">
            <AttachmentPicker
              controller={controller.attachments}
              supportsImages={
                models.find((entry) => entry.modelId === item.agent.model.modelId)
                  ?.supportsImages === true
              }
              disabled={state.sending || state.pending !== null}
            />
            <TextArea
              ref={editor}
              accessibilityLabel={t("agents.message")}
              placeholder={t("agents.message")}
              value={state.draft}
              onChangeText={(text) => controller.setDraft(text)}
              maxLength={MAX_CONVERSATION_DRAFT}
              multiline
              editable={!state.pending && !state.sending}
              textAlignVertical="top"
              className="max-h-52 min-h-28 rounded-xl border-0 bg-background px-2 py-2 text-base"
            />
            <View className="flex-row flex-wrap items-center gap-1">
              <Button
                accessibilityLabel={t("mobile.addContext")}
                variant="ghost"
                onPress={onContext}
                className="min-h-11 min-w-11 rounded-full"
              >
                <Button.Label>+</Button.Label>
              </Button>
              <Button
                accessibilityLabel={t("mobile.chooseAgent")}
                variant="ghost"
                isDisabled={!!state.pending || state.sending}
                onPress={() => setTargetOpen(true)}
                className="h-auto min-h-11 max-w-[45%] rounded-full bg-muted px-3 py-2"
              >
                <Button.Label numberOfLines={1} className="shrink text-sm">
                  {item.agent.name}
                </Button.Label>
              </Button>
              <ComputerIndicator
                devices={devices}
                state={computerState}
                open={computerOpen}
                onOpen={openComputer}
              />
              <View className="flex-1" />
              <Button
                accessibilityLabel={t("agents.send")}
                isDisabled={
                  state.loading ||
                  (!state.draft.trim() &&
                    !attachmentDrafts.some((draft) => draft.state === "ready")) ||
                  attachmentDrafts.some((draft) => draft.state !== "ready") ||
                  !!state.pending ||
                  state.sending
                }
                onPress={() => void send()}
                className="min-h-11 min-w-11 rounded-full"
              >
                <Button.Label>↑</Button.Label>
              </Button>
            </View>
            <Button
              accessibilityLabel={t("agents.model")}
              variant="ghost"
              onPress={onEdit}
              className="h-auto min-h-11 justify-start px-2 py-2"
            >
              <Button.Label numberOfLines={1} className="shrink text-xs text-muted-foreground">
                {selectedModel}
              </Button.Label>
            </Button>
            {state.effectiveMode && (
              <Text className="px-2 text-xs text-muted-foreground">
                {t("agents.spaceSettings.effectiveMode")}:{" "}
                {t(`agents.approvalSettings.${state.effectiveMode.mode}`)}
              </Text>
            )}
            {state.error && (
              <Text accessibilityRole="alert" className="px-2 text-sm text-foreground">
                {t(errorKeys[state.error])}
              </Text>
            )}
            {state.pending && !state.sending && (
              <>
                <Text className="px-2 text-sm text-muted-foreground">
                  {t("agents.pendingDelivery")}
                </Text>
                <Action
                  label={t("agents.retryDelivery")}
                  secondary
                  onPress={() => void controller.sendPending().then(onOpen)}
                />
              </>
            )}
          </View>
        </View>
      </ScrollView>
      <Modal
        visible={targetOpen}
        transparent
        animationType="none"
        onRequestClose={() => setTargetOpen(false)}
      >
        <View className="flex-1 justify-end bg-background/80">
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={() => setTargetOpen(false)}
            className="gap-3 rounded-t-3xl border border-border bg-background p-6"
          >
            <Choice
              label={t("mobile.chooseAgent")}
              placeholder={t("mobile.chooseAgent")}
              value={item.agent.id}
              options={agents.map((entry) => ({ value: entry.agent.id, label: entry.agent.name }))}
              onChange={(id) => {
                setTargetOpen(false);
                onSelect(id);
              }}
            />
            <Action label={t("common.close")} secondary onPress={() => setTargetOpen(false)} />
          </View>
        </View>
      </Modal>
      <ComputerSheet
        controller={computer}
        devices={devices}
        open={computerOpen}
        onClose={() => setComputerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}
