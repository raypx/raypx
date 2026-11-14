import { useEffect, useState, useSyncExternalStore } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { Select } from "heroui-native/select";
import { ApprovalSettingsController, type ApprovalSettingsPort } from "@raypx/agents/model";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";

/** Mode-only editing preserves the exact rules in the shared revisioned model. */
export function AccountApprovalSettings({ port }: { port: ApprovalSettingsPort }) {
  const [controller, setController] = useState<ApprovalSettingsController | null>(null);
  useEffect(() => {
    let cancelled = false;
    let next: ApprovalSettingsController | undefined;
    queueMicrotask(() => {
      if (cancelled) return;
      next = new ApprovalSettingsController(port);
      setController(next);
      void next.load();
    });
    return () => {
      cancelled = true;
      next?.dispose();
    };
  }, [port]);
  if (!controller) return null;
  return <ApprovalModeSettings controller={controller} />;
}

export function ApprovalModeSettings({ controller }: { controller: ApprovalSettingsController }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { t } = useCopy();
  const selected = state.availableModes.find((entry) => entry.mode === state.draft?.mode);
  const value = selected
    ? { value: selected.mode, label: t(`agents.approvalSettings.${selected.mode}`) }
    : undefined;
  function confirmNever() {
    return new Promise<boolean>((resolve) => {
      Alert.alert(
        t("agents.approvalSettings.neverTitle"),
        t("agents.approvalSettings.neverDescription"),
        [
          { text: t("agents.cancel"), style: "cancel", onPress: () => resolve(false) },
          {
            text: t("agents.approvalSettings.never"),
            style: "destructive",
            onPress: () => resolve(true),
          },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  }
  return (
    <View className="gap-3 border-b border-border pb-4">
      <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
        {t("agents.approvalSettings.title")}
      </Text>
      <Text className="text-sm text-foreground">{t("agents.approvalSettings.mode")}</Text>
      <Select
        value={value}
        isDisabled={state.busy || !state.draft}
        onValueChange={(option) => {
          if (option?.value === "ask" || option?.value === "never" || option?.value === "auto")
            controller.setMode(option.value);
        }}
      >
        <Select.Trigger
          accessibilityLabel={t("agents.approvalSettings.mode")}
          className="min-h-12 justify-between px-3 py-3"
        >
          <Select.Value placeholder={t("agents.approvalSettings.mode")} className="text-base" />
          <Select.TriggerIndicator />
        </Select.Trigger>
        <Select.Portal unstable_accessibilityContainerViewIsModal>
          <Select.Overlay />
          <Select.Content presentation="popover" width="trigger">
            <ScrollView className="max-h-72" keyboardShouldPersistTaps="handled">
              {state.availableModes.map((entry) => (
                <Select.Item
                  key={entry.mode}
                  value={entry.mode}
                  label={t(`agents.approvalSettings.${entry.mode}`)}
                  accessibilityLabel={t(`agents.approvalSettings.${entry.mode}`)}
                  disabled={!entry.available}
                  accessibilityState={{ disabled: !entry.available }}
                  className="min-h-12 py-3"
                >
                  <Select.ItemLabel className="text-base" />
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </ScrollView>
          </Select.Content>
        </Select.Portal>
      </Select>
      {state.availableModes.map((entry) =>
        entry.reasonCode ? (
          <Text key={entry.mode} className="text-xs text-muted-foreground">
            {t(`agents.approvalSettings.${entry.mode}`)}:{" "}
            {t(`agents.approvalSettings.reasons.${entry.reasonCode}`)}
          </Text>
        ) : null,
      )}
      <Text className="text-xs text-muted-foreground">
        {t("agents.approvalSettings.blockHint")}
      </Text>
      {state.error ? (
        <Text accessibilityRole="alert" className="text-sm text-foreground">
          {t(`agents.approvalSettings.${state.error}`)}
        </Text>
      ) : null}
      {state.saved ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
          {t("agents.approvalSettings.saved")}
        </Text>
      ) : null}
      {state.conflict ? (
        <Action
          label={t("agents.approvalSettings.discardReload")}
          secondary
          disabled={state.busy}
          onPress={() => controller.discardConflict()}
        />
      ) : (
        <Action
          label={t("agents.save")}
          disabled={!state.dirty || state.busy}
          busy={state.busy}
          onPress={() => void controller.save(confirmNever)}
        />
      )}
      {state.error === "load" ? (
        <Action
          label={t("agents.refresh")}
          secondary
          busy={state.busy}
          onPress={() => void controller.load()}
        />
      ) : null}
    </View>
  );
}
