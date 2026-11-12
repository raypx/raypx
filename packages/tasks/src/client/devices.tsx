import { useTranslations } from "./i18n.js";
import { agentProviderMetadata } from "@raypx/core/tasks";
import { Gate } from "./workspace-gate.js";

import { useCallback, useId, useRef, useState } from "react";
import { useRemoteQuery } from "./remote-query.js";
import type { SyncDevice } from "@raypx/contracts/tasks";
import { useFormatter } from "@raypx/i18n/browser";
import { SelectField } from "@raypx/ui/select-field";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { Badge } from "@raypx/ui/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@raypx/ui/components/ui/input-group";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { EmptyState } from "@raypx/ui/empty-state";
import { LaptopIcon } from "@raypx/icons/laptop";
import { SearchIcon } from "@raypx/icons/search";
import { Button } from "@raypx/ui/components/ui/button";

import { LoadingState } from "@raypx/ui/loading-state";
import { Modal } from "@raypx/ui/modal";

import type { DeviceManagementPort } from "../model/port.js";

function deviceStatus(device: SyncDevice) {
  if (device.revoked) return "revoked";
  if (device.online) return "online";
  return "offline";
}

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
  const [status, setStatus] = useState("all");
  const searchId = useId();
  const load = useCallback((signal: AbortSignal) => client.devices.list({}, { signal }), [client]);
  const { data, error, errorCode, refresh, refreshing } = useRemoteQuery(
    ["devices", accountId],
    load,
    true,
    client,
  );
  const shown = data?.filter(
    (device) =>
      `${device.name} ${device.platform}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()) &&
      (status === "all" || deviceStatus(device) === status),
  );
  return (
    <section className="flex flex-col gap-4 pt-4" data-tasks>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{c("connectedComputers")}</h2>
        <p className="text-sm text-muted-foreground">{t("devicesHint")}</p>
      </div>
      {Boolean(data?.length) && (
        <div className="flex flex-wrap items-center gap-3">
          <Field className="min-w-44 flex-1">
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
          <SelectField
            className="w-40 max-w-full"
            aria-label={c("allStatuses")}
            value={status}
            onValueChange={setStatus}
            options={[
              { value: "all", label: c("allStatuses") },
              ...(["online", "offline", "revoked"] as const).map((value) => ({
                value,
                label: t(value),
              })),
            ]}
          />
        </div>
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
        <Collapsible key={device.id} className="border-b border-border pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <h3 className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <LaptopIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                {device.name}
                <Badge variant={device.online && !device.revoked ? "secondary" : "outline"}>
                  {t(deviceStatus(device))}
                </Badge>
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {device.platform}
                {device.lastSeenAt && (
                  <> · {format.dateTime(new Date(device.lastSeenAt), "timestamp")}</>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="group" />}>
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-3.5 group-data-panel-open:rotate-90 motion-safe:transition-transform motion-safe:duration-200 group-focus-visible:transition-none"
                />
                {t("deviceDetails")}
              </CollapsibleTrigger>
              {!device.revoked && (
                <DisconnectComputer
                  key={device.epoch}
                  client={client}
                  device={device}
                  onChanged={refresh}
                />
              )}
            </div>
          </div>
          <CollapsibleContent animated>
            <div className="mt-4 grid gap-4 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
              <section className="min-w-0">
                <h4 className="mb-2 text-xs font-medium text-muted-foreground">{t("projects")}</h4>
                <ul className="space-y-1.5 text-sm wrap-anywhere">
                  {device.projects.map((project) => (
                    <li key={project.id}>{project.name}</li>
                  ))}
                </ul>
                {!device.projects.length && (
                  <p className="text-sm text-muted-foreground">{t("noDeviceProjects")}</p>
                )}
              </section>
              <section className="min-w-0">
                <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("deviceAgents")}
                </h4>
                <ul className="space-y-2">
                  {device.capabilities.map((capability) => (
                    <li
                      key={capability.provider}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span>
                        {agentProviderMetadata[capability.provider].shortLabel}{" "}
                        <span className="text-xs text-muted-foreground">{capability.version}</span>
                      </span>
                      <Badge variant="outline">
                        {capability.reason === "unconfigured"
                          ? c("unconfigured")
                          : t(capability.reason)}
                      </Badge>
                    </li>
                  ))}
                </ul>
                {!device.capabilities.length && (
                  <p className="text-sm text-muted-foreground">{t("noDeviceAgents")}</p>
                )}
              </section>
            </div>
          </CollapsibleContent>
        </Collapsible>
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
