import { useEffect, useSyncExternalStore } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { Select } from "heroui-native/select";
import type { DeviceComputersController, DeviceComputersView } from "@raypx/agents/model";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";

const emptyDeviceView: DeviceComputersView = {
  devices: [],
  selection: null,
  pairing: null,
  loading: false,
  busy: false,
  error: false,
  grantRequested: false,
};
const emptySnapshot = () => emptyDeviceView;
const emptySubscribe = () => () => {};
export function useDeviceComputerView(controller?: DeviceComputersController) {
  return useSyncExternalStore(
    controller?.subscribe ?? emptySubscribe,
    controller?.getSnapshot ?? emptySnapshot,
    controller?.getSnapshot ?? emptySnapshot,
  );
}
export function DeviceComputerSelector({ controller }: { controller: DeviceComputersController }) {
  const { t } = useCopy();
  const state = useDeviceComputerView(controller);
  useEffect(() => {
    void controller.refresh();
  }, [controller]);
  const available = state.devices.flatMap((device) =>
    device.grants
      .filter((grant) => !grant.revokedAt)
      .map((grant) => ({
        device,
        grant,
        value: grant.id,
        label: `${device.name} · ${grant.directory}`,
      })),
  );
  const selected = available.find(
    (entry) =>
      entry.value === state.selection?.grantId && entry.device.id === state.selection?.deviceId,
  );
  let value = { value: "team", label: t("agents.devices.teamSandbox") };
  if (state.selection)
    value = {
      value: state.selection.grantId,
      label: selected?.label ?? t("agents.devices.unavailable"),
    };
  return (
    <View className="gap-2 border-b border-border pb-4">
      <Text className="text-sm font-semibold text-foreground">{t("agents.devices.computer")}</Text>
      <Select
        value={value}
        isDisabled={state.busy || state.loading || state.error}
        onValueChange={(option) => {
          if (option?.value === "team") {
            void controller.select(null);
            return;
          }
          const entry = available.find((candidate) => candidate.value === option?.value);
          if (entry?.device.connected)
            void controller.select({ deviceId: entry.device.id, grantId: entry.grant.id });
        }}
      >
        <Select.Trigger
          accessibilityLabel={t("agents.devices.computer")}
          className="min-h-12 justify-between px-3 py-3"
        >
          <Select.Value placeholder={t("agents.devices.computer")} className="shrink text-base" />
          <Select.TriggerIndicator />
        </Select.Trigger>
        <Select.Portal unstable_accessibilityContainerViewIsModal>
          <Select.Overlay />
          <Select.Content presentation="popover" width="trigger">
            <ScrollView className="max-h-72">
              <Select.Item
                value="team"
                label={t("agents.devices.teamSandbox")}
                accessibilityLabel={t("agents.devices.teamSandbox")}
                className="min-h-12 py-3"
              >
                <Select.ItemLabel />
                <Select.ItemIndicator />
              </Select.Item>
              {available.map((entry) => (
                <Select.Item
                  key={entry.value}
                  value={entry.value}
                  label={entry.label}
                  accessibilityLabel={entry.label}
                  disabled={!entry.device.connected}
                  accessibilityState={{ disabled: !entry.device.connected }}
                  className="min-h-12 py-3"
                >
                  <Select.ItemLabel />
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </ScrollView>
          </Select.Content>
        </Select.Portal>
      </Select>
      {state.selection ? (
        <Text className="text-sm text-foreground">{t("agents.devices.warning")}</Text>
      ) : null}
      {state.selection && (!selected || !selected.device.connected) ? (
        <Text accessibilityRole="alert" className="text-sm text-foreground">
          {t("agents.devices.unavailable")}
        </Text>
      ) : null}
      <Text className="text-xs text-muted-foreground">{t("agents.devices.nextRun")}</Text>
      {state.error ? (
        <Text accessibilityRole="alert" className="text-sm text-foreground">
          {t("agents.devices.error")}
        </Text>
      ) : null}
      <Action
        label={t("agents.refresh")}
        secondary
        busy={state.busy}
        onPress={() => void controller.refresh()}
      />
    </View>
  );
}
export function DeviceSettings({ controller }: { controller: DeviceComputersController }) {
  const { t } = useCopy();
  const state = useDeviceComputerView(controller);
  useEffect(() => {
    void controller.refresh();
  }, [controller]);
  function revoke(deviceId: string, grantId?: string) {
    Alert.alert(
      t(grantId ? "agents.devices.revokeGrantTitle" : "agents.devices.revokeTitle"),
      t("agents.devices.revokeDescription"),
      [
        { text: t("agents.cancel"), style: "cancel" },
        {
          text: t("agents.devices.revoke"),
          style: "destructive",
          onPress: () => {
            if (grantId) void controller.revokeGrant(deviceId, grantId);
            else void controller.revoke(deviceId);
          },
        },
      ],
    );
  }
  return (
    <View className="gap-3 border-b border-border pb-4">
      <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
        {t("agents.devices.title")}
      </Text>
      <Text className="text-sm text-foreground">{t("agents.devices.warning")}</Text>
      <Text className="text-sm text-muted-foreground">{t("agents.devices.ownerOnly")}</Text>
      <View className="flex-row flex-wrap gap-2">
        <Action
          label={t("agents.devices.pair")}
          disabled={state.loading}
          busy={state.busy}
          onPress={() => void controller.pair()}
        />
        <Action
          label={t("agents.refresh")}
          secondary
          busy={state.busy}
          onPress={() => void controller.refresh()}
        />
      </View>
      {state.pairing ? (
        <View className="gap-2 border border-border p-3">
          <Text className="font-semibold text-foreground">{t("agents.devices.pairingCode")}</Text>
          <Text
            selectable
            accessibilityLabel={t("agents.devices.pairingCode")}
            className="text-xl font-semibold text-foreground"
          >
            {state.pairing.code}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {t("agents.devices.expires", { time: state.pairing.expiresAt })}
          </Text>
          <Text className="text-sm text-foreground">{t("agents.devices.pairingInstructions")}</Text>
          <Action label={t("agents.close")} secondary onPress={() => controller.clearPairing()} />
        </View>
      ) : null}
      {state.error ? (
        <Text accessibilityRole="alert" className="text-sm text-foreground">
          {t("agents.devices.error")}
        </Text>
      ) : null}
      {!state.loading && !state.devices.length ? (
        <Text className="text-sm text-muted-foreground">{t("agents.devices.empty")}</Text>
      ) : null}
      {state.grantRequested ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-foreground">
          {t("agents.devices.confirmOnDevice")}
        </Text>
      ) : null}
      {state.devices.map((device) => (
        <View key={device.id} className="gap-2 border-t border-border pt-3">
          <Text className="font-semibold text-foreground">
            {device.name} · {t(`agents.devices.${device.connectionState}`)}
          </Text>
          {device.connectionState !== "revoked" ? (
            <View className="flex-row flex-wrap gap-2">
              <Action
                label={`${t("agents.devices.grantDirectory")} · ${device.name}`}
                secondary
                disabled={!device.connected || state.busy}
                onPress={() => void controller.requestGrant(device.id)}
              />
              <Action
                label={`${t("agents.devices.revoke")} · ${device.name}`}
                secondary
                disabled={state.busy}
                onPress={() => revoke(device.id)}
              />
            </View>
          ) : null}
          {!device.grants.some((grant) => !grant.revokedAt) ? (
            <Text className="text-sm text-muted-foreground">
              {t("agents.devices.noDirectories")}
            </Text>
          ) : null}
          {device.grants
            .filter((grant) => !grant.revokedAt)
            .map((grant) => (
              <View key={grant.id} className="gap-1">
                <Text selectable className="text-sm text-foreground">
                  {grant.directory}
                </Text>
                <Action
                  label={t("agents.devices.revokeDirectory", { directory: grant.directory })}
                  secondary
                  disabled={state.busy}
                  onPress={() => revoke(device.id, grant.id)}
                />
              </View>
            ))}
        </View>
      ))}
    </View>
  );
}
