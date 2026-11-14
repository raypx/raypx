import { useLocale } from "@raypx/i18n/browser";
import { useEffect, useId, useSyncExternalStore } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { Badge } from "@raypx/ui/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/ui/select";
import { EmptyState } from "@raypx/ui/empty-state";
import { DevicesIcon } from "@raypx/icons/devices";
import { LoadingState } from "@raypx/ui/loading-state";
import { useConfirmation } from "@raypx/ui/confirmation";
import { IconButton } from "@raypx/ui/icon-button";
import { RefreshIcon } from "@raypx/icons/refresh";
import type { DeviceComputersController } from "../model/device-computers.js";
import { useTranslations } from "./i18n.js";

const platformLabels: Record<string, string> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
};

function useDeviceComputers(controller: DeviceComputersController) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    void controller.refresh();
    const timer = setInterval(() => {
      if (!controller.getSnapshot().busy) void controller.refresh();
    }, 5_000);
    return () => clearInterval(timer);
  }, [controller]);
  return state;
}

export function DevicesSettings({ controller }: { controller: DeviceComputersController }) {
  const t = useTranslations("agents");
  const locale = useLocale();
  const id = useId();
  const state = useDeviceComputers(controller);
  const confirmation = useConfirmation();
  useEffect(() => {
    if (!state.pairing) return;
    const timer = setTimeout(
      () => controller.clearPairing(),
      Math.max(0, Date.parse(state.pairing.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [controller, state.pairing]);
  useEffect(() => () => controller.clearPairing(), [controller]);
  async function revoke(deviceId: string, grantId?: string) {
    const accepted = await confirmation.confirm({
      requestKey: `revoke-device:${deviceId}:${grantId ?? "all"}`,
      title: t(grantId ? "devices.revokeGrantTitle" : "devices.revokeTitle"),
      description: t("devices.revokeDescription"),
      confirmLabel: t("devices.revoke"),
      cancelLabel: t("cancel"),
    });
    if (!accepted) return;
    if (grantId) await controller.revokeGrant(deviceId, grantId);
    else await controller.revoke(deviceId);
  }
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label={t("devices.title")}>
      <p className="text-sm">{t("devices.warning")}</p>
      <p className="text-xs text-muted-foreground">{t("devices.ownerOnly")}</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={state.busy} onClick={() => void controller.pair()}>
          {t("devices.pair")}
        </Button>
        <Button variant="outline" disabled={state.busy} onClick={() => void controller.refresh()}>
          {t("refresh")}
        </Button>
      </div>
      {state.pairing && (
        <Field>
          <FieldLabel htmlFor={`${id}-pairing`}>{t("devices.pairingCode")}</FieldLabel>
          <Input id={`${id}-pairing`} value={state.pairing.code} readOnly autoComplete="off" />
          <p className="text-xs text-muted-foreground">{t("devices.pairingInstructions")}</p>
          <time
            dateTime={state.pairing.expiresAt}
            title={new Date(state.pairing.expiresAt).toLocaleString(locale)}
            className="text-xs tabular-nums text-muted-foreground"
          >
            {t("devices.expires", {
              time: new Date(state.pairing.expiresAt).toLocaleTimeString(locale, {
                hour: "2-digit",
                minute: "2-digit",
              }),
            })}
          </time>
        </Field>
      )}
      {state.grantRequested && (
        <div className="flex min-w-0 flex-col gap-2">
          <p role="status" className="text-sm">
            {t("devices.confirmOnDevice")}
          </p>
          <p className="text-xs text-muted-foreground">{t("devices.grantInstructions")}</p>
          <code className="text-xs whitespace-pre-wrap wrap-anywhere">{`raypx device grant '${JSON.stringify({ spaceId: controller.spaceId })}'`}</code>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive-text">
          {t("devices.error")}
        </p>
      )}
      {state.loading && <LoadingState label={t("loading")} />}
      {!state.loading && state.devices.length === 0 && (
        <EmptyState
          title={t("devices.empty")}
          icon={<DevicesIcon aria-hidden="true" />}
          className="py-8"
        />
      )}
      <ul className="min-w-0 divide-y divide-border">
        {state.devices.map((device) => (
          <li key={device.id} className="flex min-w-0 flex-col gap-3 py-3" data-device={device.id}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 font-medium wrap-anywhere">{device.name}</span>
              <Badge variant="secondary">{t(`devices.${device.connectionState}`)}</Badge>
              <span className="text-xs text-muted-foreground">
                {platformLabels[device.platform] ?? t("devices.platform")}
              </span>
            </div>
            {device.connectionState !== "revoked" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!device.connected || state.busy}
                  title={!device.connected ? t("devices.offlineWaiting") : undefined}
                  onClick={() => void controller.requestGrant(device.id)}
                >
                  {t("devices.grantDirectory")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={state.busy}
                  onClick={() => void revoke(device.id)}
                >
                  {t("devices.revoke")}
                </Button>
              </div>
            )}
            <ul className="flex min-w-0 flex-col gap-2" aria-label={t("devices.directories")}>
              {device.grants
                .filter((grant) => !grant.revokedAt)
                .map((grant) => (
                  <li
                    key={grant.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-2"
                  >
                    <code className="min-w-0 text-xs whitespace-pre-wrap wrap-anywhere">
                      {grant.directory}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={state.busy}
                      aria-label={t("devices.revokeDirectory", { directory: grant.directory })}
                      onClick={() => void revoke(device.id, grant.id)}
                    >
                      {t("devices.revoke")}
                    </Button>
                  </li>
                ))}
            </ul>
            {device.grants.every((grant) => grant.revokedAt) && (
              <p className="text-xs text-muted-foreground">{t("devices.noDirectories")}</p>
            )}
          </li>
        ))}
      </ul>
      {confirmation.dialog}
    </section>
  );
}

export function DeviceComputerSelector({ controller }: { controller: DeviceComputersController }) {
  const t = useTranslations("agents");
  const id = useId();
  const state = useDeviceComputers(controller);
  const choices = state.devices.flatMap((device) =>
    device.grants
      .filter((grant) => !grant.revokedAt)
      .map((grant) => ({
        value: `${device.id}:${grant.id}`,
        label: `${device.name} · ${grant.directory}`,
        device,
        grant,
      })),
  );
  if (!state.selection && state.devices.length === 0) {
    if (state.error)
      return (
        <div className="flex min-w-0 flex-col items-start gap-2">
          <p role="alert" className="text-sm text-destructive-text">
            {t("devices.error")}
          </p>
          <IconButton
            label={t("refresh")}
            size="icon-sm"
            disabled={state.loading || state.busy}
            onClick={() => void controller.refresh()}
          >
            <RefreshIcon aria-hidden="true" />
          </IconButton>
        </div>
      );
    return null;
  }
  const value = state.selection
    ? `${state.selection.deviceId}:${state.selection.grantId}`
    : "sandbox";
  const unavailable = value !== "sandbox" && !choices.some((choice) => choice.value === value);
  const options = [
    { value: "sandbox", label: t("devices.teamSandbox") },
    ...choices.map(({ value: choiceValue, label }) => ({ value: choiceValue, label })),
  ];
  if (unavailable) options.push({ value, label: t("devices.unavailable") });
  const selectedLabel = options.find((option) => option.value === value)?.label;
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={t("devices.computer")}>
      <Field>
        <FieldLabel htmlFor={`${id}-computer`}>{t("devices.computer")}</FieldLabel>
        <Select
          value={value}
          items={options}
          disabled={state.busy || state.loading}
          onValueChange={(next) => {
            if (next === "sandbox") void controller.select(null);
            else {
              const choice = choices.find((entry) => entry.value === next);
              if (choice?.device.connected)
                void controller.select({ deviceId: choice.device.id, grantId: choice.grant.id });
            }
          }}
        >
          <SelectTrigger id={`${id}-computer`} title={selectedLabel} className="w-full min-w-0">
            <SelectValue>
              <span className="min-w-0 truncate">{selectedLabel}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="sandbox">{t("devices.teamSandbox")}</SelectItem>
              {choices.map((choice) => (
                <SelectItem
                  key={choice.value}
                  value={choice.value}
                  disabled={!choice.device.connected}
                >
                  {choice.label}
                  {!choice.device.connected && ` · ${t("devices.offline")}`}
                </SelectItem>
              ))}
              {unavailable && (
                <SelectItem value={value} disabled>
                  {t("devices.unavailable")}
                </SelectItem>
              )}
            </SelectGroup>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t("devices.nextRun")}</p>
      </Field>
      {state.selection && (
        <p className="text-sm" data-device-warning>
          {t("devices.warning")}
        </p>
      )}
      {state.selection &&
        !choices.find((choice) => choice.value === value)?.device.connected &&
        !unavailable && (
          <p role="status" className="text-xs text-muted-foreground">
            {t("devices.offlineWaiting")}
          </p>
        )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive-text">
          {t("devices.error")}
        </p>
      )}
    </section>
  );
}
