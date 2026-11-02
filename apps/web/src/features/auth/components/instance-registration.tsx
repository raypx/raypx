import { useConfirmation } from "@raypx/ui/confirmation";
import { Field, FieldGroup } from "@raypx/ui/components/ui/field";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createApiClient } from "@raypx/client";
import type { InstanceIdentity } from "@raypx/instances";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { Label } from "@raypx/ui/components/ui/label";
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
    <section className="mt-8 flex flex-col gap-4" aria-label={t("instances")}>
      <div className="flex items-center justify-between gap-3">
        <h2>{t("instances")}</h2>
        <Button
          variant="ghost"
          disabled={busy || list.isFetching}
          onClick={() => void list.refetch()}
        >
          {t("refresh")}
        </Button>
      </div>
      {list.isPending && <p role="status">{c("loading")}</p>}
      <form
        className="flex flex-col gap-3"
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
            <Label htmlFor="instance-code">{t("code")}</Label>
            <Input
              id="instance-code"
              disabled={busy}
              autoComplete="off"
              maxLength={10}
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
                setIdentity(undefined);
                setApproved(false);
              }}
            />
          </Field>
        </FieldGroup>
        <Button type="submit" variant="outline" disabled={busy || !/^[A-Z2-9]{10}$/.test(code)}>
          {t("inspect")}
        </Button>
      </form>
      {identity && (
        <div className="flex flex-col gap-3">
          <p>
            {identity.name} · {identity.platform} · {identity.appVersion}
          </p>
          <p className="break-all text-muted-foreground">{identity.instanceId}</p>
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
            {t("approve")}
          </Button>
        </div>
      )}
      {approved && <p role="status">{t("approved")}</p>}
      {list.data?.map((instance) => (
        <div key={instance.instanceId} className="flex items-center justify-between gap-3">
          <span>
            {instance.name} · {instance.platform}
          </span>
          <Button
            variant="outline"
            disabled={busy || instance.status === "revoked"}
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
            {instance.status === "revoked" ? t("revokedLabel") : t("revoke")}
          </Button>
        </div>
      ))}
      {confirmation.dialog}
      {(error || list.isError) && <p role="alert">{t("error")}</p>}
    </section>
  );
}
