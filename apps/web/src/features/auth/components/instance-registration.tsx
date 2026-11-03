import { useConfirmation } from "@raypx/ui/confirmation";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createApiClient } from "@raypx/client/api";
import type { InstanceIdentity } from "@raypx/instances";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { StatusBadge } from "@raypx/ui/status-badge";
import { IconButton } from "@raypx/ui/icon-button";
import { LoadingState } from "@raypx/ui/loading-state";
import { EmptyState } from "@raypx/ui/empty-state";
import { MonitorIcon } from "@raypx/icons/monitor";
import { RefreshIcon } from "@raypx/icons/refresh";
import { SearchIcon } from "@raypx/icons/search";
import { CheckCircleIcon } from "@raypx/icons/check-circle";
import { AlertCircleIcon } from "@raypx/icons/alert-circle";
import { CloseIcon } from "@raypx/icons/close";
import { SpinnerIcon } from "@raypx/icons/spinner";
import { useTranslations } from "@raypx/i18n/browser";
import { apiUrl } from "../client";
const client = createApiClient({ baseUrl: apiUrl });
export function InstanceRegistration({ accountId }: { accountId: string }) {
  const t = useTranslations("instances"),
    c = useTranslations("common");
  const confirmation = useConfirmation();
  const [code, setCode] = useState(""),
    [identity, setIdentity] = useState<InstanceIdentity>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [approved, setApproved] = useState(false);
  const list = useQuery({
    queryKey: ["instances", accountId],
    queryFn: () => client.instances.list({}),
    retry: false,
  });
  async function act(operation: () => Promise<unknown>) {
    setBusy(true);
    setError(false);
    try {
      await operation();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="flex flex-col gap-5" aria-label={t("instances")}>
      <div className="rounded-xl border border-border bg-background p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <MonitorIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">{t("instances")}</h2>
            {list.data && <Badge variant="outline">{list.data.length}</Badge>}
          </div>
          <IconButton
            label={t("refresh")}
            variant="outline"
            disabled={busy || list.isFetching}
            onClick={() => void list.refetch()}
          >
            <RefreshIcon
              aria-hidden="true"
              className={list.isFetching ? "animate-spin motion-reduce:animate-none" : undefined}
            />
          </IconButton>
        </div>
        {list.isPending && <LoadingState label={c("loading")} />}
        {list.data?.length === 0 && !list.isError && (
          <EmptyState
            title={t("empty")}
            icon={<MonitorIcon aria-hidden="true" />}
            className="py-8"
          />
        )}
        {list.data && list.data.length > 0 && (
          <ul className="mt-5 flex flex-col gap-3">
            {list.data.map((instance) => (
              <li
                key={instance.instanceId}
                className="flex flex-wrap items-start gap-3 rounded-lg border border-border p-4"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <MonitorIcon aria-hidden="true" className="size-5" />
                </span>
                <div className="flex min-w-0 flex-1 basis-40 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
                      {instance.name}
                    </h3>
                    <StatusBadge
                      label={t(instance.status === "revoked" ? "revokedLabel" : "registeredLabel")}
                      tone={instance.status === "revoked" ? "neutral" : "success"}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{instance.platform}</Badge>
                    <Badge variant="outline">{instance.appVersion}</Badge>
                  </div>
                </div>
                {instance.status !== "revoked" && (
                  <Button
                    variant="outline"
                    className="ml-auto"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        if (
                          await confirmation.confirm({
                            title: t("revoke"),
                            description: t("revokeConfirm"),
                            confirmLabel: t("revoke"),
                            cancelLabel: c("cancel"),
                          })
                        ) {
                          await client.instances.revoke({ instanceId: instance.instanceId });
                          await list.refetch();
                        }
                      })
                    }
                  >
                    <CloseIcon aria-hidden="true" data-icon="inline-start" />
                    {t("revoke")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        className="flex flex-col gap-4 rounded-xl border border-border bg-background p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void act(async () => {
            setIdentity(await client.instances.inspect({ code }));
            setApproved(false);
          });
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="instance-code">
              <MonitorIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              {t("code")}
            </FieldLabel>
            <Input
              id="instance-code"
              disabled={busy}
              autoComplete="off"
              maxLength={10}
              className="max-w-sm font-mono tracking-widest"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
                setIdentity(undefined);
                setApproved(false);
              }}
            />
          </Field>
        </FieldGroup>
        <Button
          type="submit"
          variant="outline"
          className="self-start"
          disabled={busy || !/^[A-Z2-9]{10}$/.test(code)}
        >
          {busy ? (
            <SpinnerIcon
              aria-hidden="true"
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <SearchIcon aria-hidden="true" data-icon="inline-start" />
          )}
          {t("inspect")}
        </Button>
      </form>
      {identity && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-background p-5">
          <div className="flex flex-wrap items-center gap-2">
            <MonitorIcon aria-hidden="true" className="size-5 text-muted-foreground" />
            <h3 className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
              {identity.name}
            </h3>
            <StatusBadge label={t("pending")} tone="info" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{identity.platform}</Badge>
            <Badge variant="outline">{identity.appVersion}</Badge>
          </div>
          <p className="break-all font-mono text-xs text-muted-foreground">{identity.instanceId}</p>
          <Button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await client.instances.approve({ code });
                setIdentity(undefined);
                setApproved(true);
                await list.refetch();
              })
            }
          >
            <CheckCircleIcon aria-hidden="true" data-icon="inline-start" />
            {t("approve")}
          </Button>
        </div>
      )}
      {approved && (
        <Alert role="status">
          <CheckCircleIcon aria-hidden="true" />
          <AlertDescription>{t("approved")}</AlertDescription>
        </Alert>
      )}
      {confirmation.dialog}
      {(error || list.isError) && (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertDescription>{t("error")}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
