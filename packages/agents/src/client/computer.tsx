import { useLayoutEffect, useRef, useSyncExternalStore, type Ref } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { Alert, AlertAction, AlertDescription } from "@raypx/ui/components/ui/alert";
import { IconButton } from "@raypx/ui/icon-button";
import { useConfirmation } from "@raypx/ui/confirmation";
import { MonitorIcon } from "@raypx/icons/monitor";
import { CloseIcon } from "@raypx/icons/close";
import { PlayIcon } from "@raypx/icons/play";
import { StopIcon } from "@raypx/icons/stop";
import { RefreshIcon } from "@raypx/icons/refresh";
import type { ToolActivity } from "@raypx/core/conversation";
import type {
  ApprovalPort,
  ConversationSelection,
  ComputerController,
  ComputerView,
} from "../model.js";
import { ComputerActivity } from "./tool-activity.js";
import { ComputerFiles } from "./computer-files.js";
import { ComputerScreen } from "./computer-screen.js";
import { useTranslations } from "./i18n.js";
import type { DeviceComputersController } from "../model/device-computers.js";
import { DeviceComputerSelector } from "./device-computers.js";

const statusKeys = {
  loading: "loading",
  "not-configured": "computerNotConfigured",
  stopped: "computerStopped",
  destroyed: "computerStopped",
  starting: "computerStarting",
  running: "computerRunning",
  stopping: "computerStopping",
  failed: "computerFailed",
} as const;
const failureKeys = {
  PROVIDER_UNAVAILABLE: "computerProviderUnavailable",
  RESTORE_FAILED: "computerRestoreFailed",
} as const;
const errorKeys = {
  load: "computerLoadError",
  start: "computerStartError",
  stop: "computerStopError",
} as const;

export function ComputerIndicator({
  state,
  open,
  onOpen,
  panelId,
  ref,
  deviceName,
  deviceConnected,
  statusLabel,
  compact = false,
}: {
  state: ComputerView;
  open: boolean;
  onOpen: () => void;
  panelId?: string;
  ref?: Ref<HTMLButtonElement>;
  deviceName?: string | undefined;
  deviceConnected?: boolean | undefined;
  statusLabel?: string | undefined;
  compact?: boolean;
}) {
  const t = useTranslations("agents");
  let status =
    statusLabel ??
    (state.error === "load" ? t("computerUnavailable") : t(statusKeys[state.status]));
  if (state.unavailableReason) status = t(`computerAvailability.${state.unavailableReason}`);
  if (deviceName)
    status = `${deviceName} · ${t(deviceConnected ? "devices.connected" : "devices.offline")}`;
  const label = t("computerIndicator", { state: status });
  return (
    <Button
      ref={ref}
      size="sm"
      variant={compact ? "default" : "ghost"}
      className="shrink-0 flex-nowrap whitespace-nowrap"
      aria-label={label}
      title={label}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      onClick={onOpen}
    >
      <MonitorIcon data-icon="inline-start" aria-hidden="true" />
      {compact ? (
        <span className="shrink-0 text-xs whitespace-nowrap">{t("computerShort")}</span>
      ) : (
        <span className="shrink-0 text-xs whitespace-nowrap">{status}</span>
      )}
    </Button>
  );
}

/** Lifecycle is one section; future computer capabilities can add their own sections. */
export function ComputerPanel({
  controller,
  onClose,
  sheet = false,
  activity = [],
  approvalPort,
  selection,
  devices,
  deviceSelected = false,
  compact = false,
  focusOnMount = true,
  showFiles = true,
  showActivity = true,
}: {
  controller: ComputerController;
  onClose: () => void;
  sheet?: boolean;
  activity?: readonly ToolActivity[];
  approvalPort?: ApprovalPort | undefined;
  selection?: ConversationSelection | undefined;
  devices?: DeviceComputersController | null | undefined;
  deviceSelected?: boolean | undefined;
  compact?: boolean;
  focusOnMount?: boolean;
  showFiles?: boolean;
  showActivity?: boolean;
}) {
  const t = useTranslations("agents");
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const deviceState = useSyncExternalStore(
    devices?.subscribe ?? subscribeNoDevices,
    devices?.getSnapshot ?? noDevices,
    devices?.getSnapshot ?? noDevices,
  );
  const showSandbox =
    !deviceSelected && !deviceState?.selection && !deviceState?.loading && !deviceState?.error;
  const title = useRef<HTMLHeadingElement>(null);
  const confirmation = useConfirmation();
  useLayoutEffect(() => {
    if (!sheet && focusOnMount) title.current?.focus();
  }, [sheet, focusOnMount]);
  const disabled =
    state.pending !== null ||
    state.refreshing ||
    state.error === "load" ||
    state.status === "starting" ||
    state.status === "stopping";
  const canStart =
    state.status === "starting" ||
    state.status === "stopped" ||
    state.status === "destroyed" ||
    state.status === "failed";
  function stop() {
    void controller.stop(() =>
      confirmation.confirm({
        requestKey: "stop-computer",
        title: t("computerStopTitle"),
        description: t("computerStopDescription"),
        confirmLabel: t("computerStop"),
        cancelLabel: t("cancel"),
      }),
    );
  }
  const titleClass =
    "min-w-0 truncate rounded-md text-lg font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="box-border flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto p-3">
      {!sheet && (
        <header className="flex min-w-0 items-center justify-between gap-2">
          <h2
            ref={title}
            tabIndex={-1}
            className={
              compact
                ? "min-w-0 truncate text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                : titleClass
            }
          >
            {t("computerTitle")}
          </h2>
          <IconButton label={t("computerClose")} size="icon-sm" onClick={onClose}>
            <CloseIcon aria-hidden="true" />
          </IconButton>
        </header>
      )}
      {devices && <DeviceComputerSelector controller={devices} />}
      {deviceState?.loading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
      {showSandbox && (
        <section aria-label={t("computerStatus")} className="flex min-w-0 flex-col gap-3">
          <h3 className="text-xs font-medium text-muted-foreground">{t("computerStatus")}</h3>
          <p role="status" aria-live="polite" aria-atomic="true" className="text-sm wrap-anywhere">
            {state.error === "load" ? t("computerUnavailable") : t(statusKeys[state.status])}
            {state.failureCode && !state.unavailableReason && (
              <span className="mt-2 block">{t(failureKeys[state.failureCode])}</span>
            )}
            {state.unavailableReason && (
              <span className="mt-2 block">
                {t(`computerAvailability.${state.unavailableReason}`)}
              </span>
            )}
          </p>
          {state.error && (
            <Alert>
              <AlertDescription>{t(errorKeys[state.error])}</AlertDescription>
              <AlertAction>
                <IconButton
                  size="icon-sm"
                  label={t("refresh")}
                  disabled={state.refreshing || state.pending !== null}
                  onClick={() => void controller.refresh()}
                >
                  <RefreshIcon aria-hidden="true" />
                </IconButton>
              </AlertAction>
            </Alert>
          )}
          {canStart && (
            <Button
              className="self-start"
              disabled={disabled}
              onClick={() => void controller.start()}
            >
              <PlayIcon data-icon="inline-start" aria-hidden="true" />
              {state.status === "failed" ? t("computerRetry") : t("computerStart")}
            </Button>
          )}
          {(state.status === "running" || state.status === "stopping") && (
            <Button variant="outline" className="self-start" disabled={disabled} onClick={stop}>
              <StopIcon data-icon="inline-start" aria-hidden="true" />
              {t("computerStop")}
            </Button>
          )}
        </section>
      )}
      {showSandbox && controller.screen && state.status !== "not-configured" && (
        <ComputerScreen controller={controller.screen} status={state.status} />
      )}
      {showFiles && showSandbox && controller.files && (
        <ComputerFiles
          controller={controller.files}
          status={state.status}
          refreshKey={activity
            .filter(
              (tool) =>
                tool.finishedAt &&
                (tool.toolName === "computer_write_file" ||
                  tool.toolName === "computer_run_command"),
            )
            .map((tool) => `${tool.runId}:${tool.toolCallId}:${tool.finishedAt}`)
            .join("|")}
        />
      )}
      {showActivity && (
        <ComputerActivity activity={activity} approvalPort={approvalPort} selection={selection} />
      )}
      {confirmation.dialog}
    </div>
  );
}

function subscribeNoDevices() {
  return () => {};
}
function noDevices() {
  return null;
}
