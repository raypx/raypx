import { useEffect, useSyncExternalStore } from "react";
import { Button } from "heroui-native/button";
import { ScrollView, Text, View } from "react-native";
import {
  computerFileRows,
  computerPreviewText,
  type ComputerFilesController,
  type ComputerView,
  type DirectoryView,
  type FilePreviewView,
} from "@raypx/agents/model";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";

function FileState({ value }: { value: DirectoryView | FilePreviewView }) {
  const { t } = useCopy();
  if (value.status === "available") return null;
  if (value.status === "waiting")
    return (
      <Text accessibilityRole="text" className="text-sm text-muted-foreground">
        {t("agents.files.deviceWaiting")}
      </Text>
    );
  if (value.status === "unavailable" && value.code === "DEVICE_NOT_OWNED")
    return (
      <Text className="text-sm text-muted-foreground">{t("agents.files.deviceNotOwned")}</Text>
    );
  if (value.status === "unavailable" && value.code === "DEVICE_GRANT_UNAVAILABLE")
    return (
      <Text className="text-sm text-muted-foreground">{t("agents.files.deviceUnavailable")}</Text>
    );
  if (value.status === "not-running") {
    const keys = {
      stopped: "agents.computerStopped",
      destroyed: "agents.computerStopped",
      starting: "agents.computerStarting",
      running: "agents.computerRunning",
      stopping: "agents.computerStopping",
      failed: "agents.computerFailed",
    } as const;
    return (
      <Text className="text-sm text-muted-foreground">
        {t("agents.files.notRunning", { state: t(keys[value.state ?? "stopped"]) })}
      </Text>
    );
  }
  const keys = {
    loading: "agents.loading",
    error: "agents.files.loadError",
    "not-configured": "agents.files.notConfigured",
    unavailable: "agents.files.unavailable",
  } as const;
  return (
    <Text
      accessibilityRole={value.status === "error" ? "alert" : "text"}
      className="text-sm text-muted-foreground"
    >
      {t(keys[value.status])}
    </Text>
  );
}

/** Bounded read-only computer files; this surface never starts the computer. */
export function ComputerFiles({
  controller,
  status,
  device,
}: {
  controller: ComputerFilesController;
  status: ComputerView["status"];
  device?: import("@raypx/core/computers").DeviceComputerSelection | null | undefined;
}) {
  const { t } = useCopy();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    controller.selectComputer(device ?? null);
    if (!device && status === "loading") return;
    if (device || status === "running") void controller.refresh();
    else if (status !== "loading") controller.setUnavailable(status);
  }, [controller, status, device]);
  useEffect(() => () => controller.clear(), [controller]);
  const root = state.directories["."];
  return (
    <ScrollView
      accessibilityLabel={t("agents.files.title")}
      contentContainerClassName="gap-3 p-4"
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text accessibilityRole="header" className="text-sm font-medium text-foreground">
          {device ? t("agents.files.deviceTitle") : t("agents.devices.teamSandbox")} ·{" "}
          {t("agents.files.workspace")}
        </Text>
        <Action
          label={t("agents.files.refresh")}
          secondary
          disabled={(!device && status !== "running") || state.refreshing}
          onPress={() => void controller.refresh()}
        />
      </View>
      {root && <FileState value={root} />}
      {root?.status === "available" &&
        computerFileRows(state).map((row) => (
          <View key={row.path} className="gap-1">
            <Button
              variant="ghost"
              accessibilityLabel={row.path === "." ? t("agents.files.workspace") : row.path}
              accessibilityHint={row.kind === "symlink" ? t("agents.files.symlink") : undefined}
              accessibilityState={{
                expanded: row.kind === "directory" ? state.expanded.includes(row.path) : undefined,
                selected: state.selectedPath === row.path,
                disabled: row.kind === "symlink",
              }}
              isDisabled={row.kind === "symlink"}
              onPress={() => {
                if (row.kind === "file") void controller.select(row.path);
                if (row.kind === "directory" && state.expanded.includes(row.path))
                  controller.collapse(row.path);
                else if (row.kind === "directory") void controller.expand(row.path);
              }}
              className="h-auto min-h-11 justify-start rounded-lg px-3 py-2"
            >
              <Button.Label numberOfLines={1} className="shrink text-sm">
                {row.kind === "directory" ? "▸ " : ""}
                {row.path === "." ? t("agents.files.workspace") : row.path}
              </Button.Label>
            </Button>
            {state.expanded.includes(row.path) && state.directories[row.path] && (
              <FileState value={state.directories[row.path]!} />
            )}
          </View>
        ))}
      {root?.status === "available" && root.entries.length === 0 && (
        <Text className="text-sm text-muted-foreground">{t("agents.files.empty")}</Text>
      )}
      {root?.status === "available" && root.truncated && (
        <Text className="text-xs text-muted-foreground">
          {t("agents.files.directoryTruncated")}
        </Text>
      )}
      {state.selectedPath && state.preview && (
        <View
          accessibilityLabel={t("agents.files.preview")}
          className="gap-2 rounded-xl bg-muted p-3"
        >
          <Text accessibilityRole="header" className="text-sm font-medium text-foreground">
            {state.selectedPath}
          </Text>
          <FileState value={state.preview} />
          {state.preview.status === "available" && (
            <>
              <Text className="text-xs text-muted-foreground">
                {t("agents.files.size", { size: state.preview.size })}
              </Text>
              {state.preview.contentType === "text" && (
                <ScrollView horizontal>
                  <Text selectable className="font-mono text-sm leading-6 text-foreground">
                    {computerPreviewText(state.preview.bytes)}
                  </Text>
                </ScrollView>
              )}
              {state.preview.contentType === "binary" && (
                <Text className="text-sm text-muted-foreground">{t("agents.files.binary")}</Text>
              )}
              {state.preview.truncated && (
                <Text className="text-xs text-muted-foreground">
                  {t("agents.files.previewTruncated")}
                </Text>
              )}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}
