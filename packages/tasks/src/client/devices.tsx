import { Gate } from "./workspace-gate.js";

import { useCallback, useRef, useState } from "react";
import { useRemoteQuery } from "./remote-query.js";
import type { SyncDevice } from "@raypx/contracts/tasks";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";

import { LoadingState } from "@raypx/ui/loading-state";
import { Modal } from "@raypx/ui/modal";

import type { DeviceManagementPort } from "../model/port.js";

export function DeviceSettings({
  client,
  accountId,
  pending,
}: {
  client: DeviceManagementPort;
  accountId: string | null;
  pending?: boolean;
}) {
  if (!accountId || pending) return <Gate {...(pending === undefined ? {} : { pending })} />;
  return <Devices key={accountId} accountId={accountId} client={client} />;
}
function Devices({ client, accountId }: { client: DeviceManagementPort; accountId: string }) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const format = useFormatter();
  const load = useCallback((signal: AbortSignal) => client.devices.list({}, { signal }), [client]);
  const { data, error, errorCode, refresh, refreshing } = useRemoteQuery(
    ["devices", accountId],
    load,
    true,
    client,
  );
  return (
    <section className="mt-8 border-t border-border pt-7" data-tasks>
      <h2 className="text-base">{t("devices")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("devicesHint")}</p>
      {error && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-destructive-text">
            {t(errorCode)}
          </p>
          <Button variant="outline" disabled={refreshing} onClick={refresh}>
            {c("retry")}
          </Button>
        </div>
      )}
      {!data && !error && <LoadingState label={c("loading")} />}
      {data?.length === 0 && <p className="mt-5 text-sm text-muted-foreground">{t("noDevices")}</p>}
      {data?.map((device) => (
        <div
          key={device.id}
          className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-5"
        >
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <h3 className="text-sm font-medium">{device.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {device.platform} ·{" "}
              {t(device.revoked ? "revoked" : device.online ? "online" : "offline")}
              {device.lastSeenAt && (
                <> · {format.dateTime(new Date(device.lastSeenAt), "timestamp")}</>
              )}
            </p>
          </div>
          {!device.revoked && (
            <DisconnectComputer
              key={device.epoch}
              client={client}
              device={device}
              onChanged={refresh}
            />
          )}
        </div>
      ))}
    </section>
  );
}

function DisconnectComputer({
  client,
  device,
  onChanged,
}: {
  client: DeviceManagementPort;
  device: SyncDevice;
  onChanged: () => void;
}) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const active = useRef(false);
  async function revoke() {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError(false);
    try {
      await client.devices.revoke(
        { deviceId: device.id, epoch: device.epoch },
        { signal: AbortSignal.timeout(15_000) },
      );
      setRevoked(true);
      setOpen(false);
      onChanged();
    } catch {
      setError(true);
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={t("revoke")}
      description={t("revokeConfirm")}
      closeLabel={c("close")}
      trigger={
        <Button variant="outline" disabled={revoked}>
          {t(revoked ? "revoked" : "revoke")}
        </Button>
      }
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) setError(false);
      }}
      busy={busy}
    >
      <p className="break-words text-sm font-medium">{device.name}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {t("NETWORK_UNAVAILABLE")}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
          {c("cancel")}
        </Button>
        <Button variant="destructive" disabled={busy} onClick={() => void revoke()}>
          {busy ? c("working") : t("revoke")}
        </Button>
      </div>
    </Modal>
  );
}
