import { Gate } from "./workspace-gate.tsx";

import { useCallback, useId, useRef, useState } from "react";
import { useRemoteQuery } from "./remote-query.ts";
import type { SyncDevice } from "@raypx/contracts/tasks";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import { Badge } from "@raypx/ui/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@raypx/ui/components/ui/input-group";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { EmptyState } from "@raypx/ui/empty-state";
import { LaptopIcon } from "@raypx/icons/laptop";
import { SearchIcon } from "@raypx/icons/search";
import { Button } from "@raypx/ui/components/ui/button";

import { LoadingState } from "@raypx/ui/loading-state";
import { Modal } from "@raypx/ui/modal";

import type { DeviceManagementPort } from "../model/port.ts";

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
  const [query, setQuery] = useState("");
  const searchId = useId();
  const load = useCallback((signal: AbortSignal) => client.devices.list({}, { signal }), [client]);
  const { data, error, errorCode, refresh, refreshing } = useRemoteQuery(
    ["devices", accountId],
    load,
    true,
    client,
  );
  const shown = data?.filter((device) =>
    `${device.name} ${device.platform}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <section className="flex flex-col gap-4 pt-4" data-tasks>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t("devices")}</h2>
        <p className="text-sm text-muted-foreground">{t("devicesHint")}</p>
      </div>
      {Boolean(data?.length) && (
        <Field>
          <FieldLabel className="sr-only" htmlFor={searchId}>
            {t("searchDevices")}
          </FieldLabel>
          <InputGroup controlSize="sm">
            <InputGroupAddon>
              <SearchIcon aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchDevices")}
            />
          </InputGroup>
        </Field>
      )}
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
      {data?.length === 0 && (
        <EmptyState icon={<LaptopIcon aria-hidden="true" />} title={t("noDevices")} />
      )}
      {Boolean(data?.length) && shown?.length === 0 && <EmptyState title={t("noDevicesMatch")} />}
      {shown?.map((device) => (
        <div
          key={device.id}
          className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"
        >
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <h3 className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <LaptopIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              {device.name}
              <Badge variant={device.online && !device.revoked ? "secondary" : "outline"}>
                {t(device.revoked ? "revoked" : device.online ? "online" : "offline")}
              </Badge>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {device.platform}
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
