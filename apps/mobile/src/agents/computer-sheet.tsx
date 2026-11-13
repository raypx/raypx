import { useSyncExternalStore } from "react";
import { Alert, Modal, ScrollView, Text, View } from "react-native";
import { Button } from "heroui-native/button";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ComputerController, ComputerView } from "@raypx/agents/model";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";

const statusKeys = {
  loading: "agents.loading",
  "not-configured": "agents.computerNotConfigured",
  stopped: "agents.computerStopped",
  destroyed: "agents.computerStopped",
  starting: "agents.computerStarting",
  running: "agents.computerRunning",
  stopping: "agents.computerStopping",
  failed: "agents.computerFailed",
} as const;
const failureKeys = {
  PROVIDER_UNAVAILABLE: "agents.computerProviderUnavailable",
  RESTORE_FAILED: "agents.computerRestoreFailed",
} as const;
const errorKeys = {
  load: "agents.computerLoadError",
  start: "agents.computerStartError",
  stop: "agents.computerStopError",
} as const;

export function ComputerIndicator({
  state,
  open,
  onOpen,
}: {
  state: ComputerView;
  open: boolean;
  onOpen: () => void;
}) {
  const { t } = useCopy();
  const status = t(
    state.error === "load" ? "agents.computerUnavailable" : statusKeys[state.status],
  );
  return (
    <Button
      accessibilityLabel={t("agents.computerIndicator", { state: status })}
      accessibilityState={{ expanded: open }}
      onPress={onOpen}
      variant="ghost"
      className="h-auto min-h-11 max-w-48 shrink px-2 py-2"
    >
      <Button.Label className="shrink text-xs">{status}</Button.Label>
    </Button>
  );
}

/** Native modal presentation avoids adding the optional Gorhom sheet dependency. */
export function ComputerSheet({
  controller,
  open,
  onClose,
}: {
  controller: ComputerController;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useCopy();
  const insets = useSafeAreaInsets();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const disabled =
    state.pending !== null ||
    state.refreshing ||
    state.error === "load" ||
    state.status === "starting" ||
    state.status === "stopping";
  const canStart = state.status === "stopped" || state.status === "failed";
  const canStop = state.status === "running" || state.status === "stopping";
  function stop() {
    void controller.stop(
      () =>
        new Promise<boolean>((resolve) => {
          Alert.alert(
            t("agents.computerStopTitle"),
            t("agents.computerStopDescription"),
            [
              { text: t("agents.cancel"), style: "cancel", onPress: () => resolve(false) },
              {
                text: t("agents.computerStop"),
                style: "destructive",
                onPress: () => resolve(true),
              },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        }),
    );
  }
  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      supportedOrientations={[
        "portrait",
        "portrait-upside-down",
        "landscape-left",
        "landscape-right",
      ]}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-background/80">
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          className="max-h-[85%] w-full max-w-xl self-center rounded-t-2xl border border-border bg-background"
        >
          <ScrollView
            contentContainerClassName="gap-5 p-6"
            contentContainerStyle={{
              paddingBottom: Math.max(insets.bottom, 24),
              paddingLeft: Math.max(insets.left, 24),
              paddingRight: Math.max(insets.right, 24),
            }}
          >
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Text
                accessibilityRole="header"
                className="shrink text-lg font-semibold text-foreground"
              >
                {t("agents.computerTitle")}
              </Text>
              <Action label={t("agents.computerClose")} secondary onPress={onClose} />
            </View>
            <Text className="text-sm font-semibold text-muted-foreground">
              {t("agents.computerStatus")}
            </Text>
            <Text accessibilityLiveRegion="polite" className="text-base text-foreground">
              {t(state.error === "load" ? "agents.computerUnavailable" : statusKeys[state.status])}
            </Text>
            {state.failureCode ? (
              <Text className="text-sm leading-5 text-foreground">
                {t(failureKeys[state.failureCode])}
              </Text>
            ) : null}
            {state.error ? (
              <>
                <Text accessibilityRole="alert" className="text-sm leading-5 text-foreground">
                  {t(errorKeys[state.error])}
                </Text>
                <Action
                  label={t("agents.refresh")}
                  secondary
                  disabled={state.refreshing || state.pending !== null}
                  onPress={() => void controller.refresh()}
                />
              </>
            ) : null}
            {canStart ? (
              <Action
                label={t(
                  state.status === "failed" ? "agents.computerRetry" : "agents.computerStart",
                )}
                busy={state.pending === "start"}
                disabled={disabled}
                onPress={() => void controller.start()}
              />
            ) : null}
            {canStop ? (
              <Action
                label={t("agents.computerStop")}
                busy={state.pending === "stop"}
                secondary
                disabled={disabled}
                onPress={stop}
              />
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
