import { useLayoutEffect, useRef, useSyncExternalStore, type Ref } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { Alert, AlertAction, AlertDescription } from "@raypx/ui/components/ui/alert";
import { SheetTitle } from "@raypx/ui/components/ui/sheet";
import { IconButton } from "@raypx/ui/icon-button";
import { useConfirmation } from "@raypx/ui/confirmation";
import { MonitorIcon } from "@raypx/icons/monitor";
import { CloseIcon } from "@raypx/icons/close";
import { PlayIcon } from "@raypx/icons/play";
import { StopIcon } from "@raypx/icons/stop";
import { RefreshIcon } from "@raypx/icons/refresh";
import type { ComputerController, ComputerView } from "../model.js";
import { useTranslations } from "./i18n.js";

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
}: {
  state: ComputerView;
  open: boolean;
  onOpen: () => void;
  panelId?: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  const t = useTranslations("agents");
  const status = state.error === "load" ? t("computerUnavailable") : t(statusKeys[state.status]);
  const label = t("computerIndicator", { state: status });
  return (
    <Button
      ref={ref}
      size="sm"
      variant="ghost"
      className="min-w-0 shrink-0"
      aria-label={label}
      title={label}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      onClick={onOpen}
    >
      <MonitorIcon data-icon="inline-start" aria-hidden="true" />
      <span className="max-w-28 truncate text-xs">{status}</span>
    </Button>
  );
}

/** Lifecycle is one section; future computer capabilities can add their own sections. */
export function ComputerPanel({
  controller,
  onClose,
  sheet = false,
}: {
  controller: ComputerController;
  onClose: () => void;
  sheet?: boolean;
}) {
  const t = useTranslations("agents");
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const title = useRef<HTMLHeadingElement>(null);
  const confirmation = useConfirmation();
  useLayoutEffect(() => {
    if (!sheet) title.current?.focus();
  }, [sheet]);
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
      <header className="flex min-w-0 items-center justify-between gap-2">
        {sheet ? (
          <SheetTitle className={titleClass}>{t("computerTitle")}</SheetTitle>
        ) : (
          <h2 ref={title} tabIndex={-1} className={titleClass}>
            {t("computerTitle")}
          </h2>
        )}
        <IconButton label={t("computerClose")} size="icon-sm" onClick={onClose}>
          <CloseIcon aria-hidden="true" />
        </IconButton>
      </header>
      <section aria-label={t("computerStatus")} className="flex min-w-0 flex-col gap-3">
        <h3 className="text-xs font-medium text-muted-foreground">{t("computerStatus")}</h3>
        <p role="status" aria-live="polite" aria-atomic="true" className="text-sm wrap-anywhere">
          {state.error === "load" ? t("computerUnavailable") : t(statusKeys[state.status])}
          {state.failureCode && (
            <span className="mt-2 block">{t(failureKeys[state.failureCode])}</span>
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
      {confirmation.dialog}
    </div>
  );
}
