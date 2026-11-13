import { useEffect, useState } from "react";
import type { JobDefinition } from "@raypx/core/jobs";
import type { LocalResult } from "@raypx/contracts/local-client";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { useConfirmation } from "@raypx/ui/confirmation";
import { useTranslations } from "../../i18n.js";
import { localRequest } from "../../lib/desktop.js";

export function LocalJobTriggers({ job, onClose }: { job: JobDefinition; onClose: () => void }) {
  const t = useTranslations("automations");
  const c = useTranslations("common");
  const { confirm, dialog } = useConfirmation();
  const [info, setInfo] = useState<LocalResult<"jobs.triggerInfo">>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [keyVersions, setKeyVersions] = useState({ webhook: 0, github: 0 });
  useEffect(() => {
    let active = true;
    void localRequest("jobs.triggerInfo", { id: job.id }).then(
      (result) => {
        if (active) setInfo(result);
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [job.id]);
  async function rotate(trigger: "webhook" | "github") {
    if (
      !(await confirm({
        title: t(trigger === "github" ? "local.rotateGitHub" : "local.rotateWebhook"),
        description: t("local.rotateWebhookHint"),
        confirmLabel: t(trigger === "github" ? "local.rotateGitHub" : "local.rotateWebhook"),
        cancelLabel: c("cancel"),
      }))
    )
      return;
    setBusy(true);
    setError(false);
    try {
      const endpoint = await localRequest("jobs.rotateWebhook", { id: job.id, trigger });
      setInfo((current) => current && { ...current, [trigger]: endpoint });
      setKeyVersions((current) => ({ ...current, [trigger]: current[trigger] + 1 }));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-8 border-t border-border py-4">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">
          {job.name} · {t("local.triggerDetails")}
        </h2>
        <Button variant="ghost" onClick={onClose}>
          {c("close")}
        </Button>
      </header>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{c("error")}</AlertDescription>
        </Alert>
      )}
      {!info && !error && <p role="status">{c("loading")}</p>}
      {info && (
        <FieldGroup className="max-w-2xl">
          {(["webhook", "github"] as const).map((trigger) => {
            if (!job.triggers?.[trigger]) return null;
            const endpoint = info[trigger];
            return endpoint ? (
              <EndpointFields
                key={`${trigger}:${keyVersions[trigger]}`}
                trigger={trigger}
                endpoint={endpoint}
                busy={busy}
                onRotate={() => void rotate(trigger)}
              />
            ) : (
              <p key={trigger} className="text-sm text-muted-foreground">
                {t(trigger === "github" ? "local.githubUnavailable" : "local.ingressUnavailable")}
              </p>
            );
          })}
          {job.triggers?.email &&
            (info.email ? (
              <Field>
                <FieldLabel htmlFor="routine-email">{t("local.emailAddress")}</FieldLabel>
                <Input id="routine-email" value={info.email} readOnly />
              </Field>
            ) : (
              <p className="text-sm text-muted-foreground">{t("local.emailUnavailable")}</p>
            ))}
        </FieldGroup>
      )}
      {dialog}
    </section>
  );
}

function EndpointFields({
  trigger,
  endpoint,
  busy,
  onRotate,
}: {
  trigger: "webhook" | "github";
  endpoint: { url: string; key: string };
  busy: boolean;
  onRotate: () => void;
}) {
  const t = useTranslations("automations");
  const [visible, setVisible] = useState(false);
  const github = trigger === "github";
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`routine-${trigger}-url`}>
          {t(github ? "local.githubUrl" : "local.webhookUrl")}
        </FieldLabel>
        <Input id={`routine-${trigger}-url`} value={endpoint.url} readOnly />
      </Field>
      <Field>
        <FieldLabel htmlFor={`routine-${trigger}-key`}>
          {t(github ? "local.githubKey" : "local.webhookKey")}
        </FieldLabel>
        <Input
          id={`routine-${trigger}-key`}
          type={visible ? "text" : "password"}
          value={endpoint.key}
          readOnly
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setVisible(!visible)}>
          {t(visible ? "local.hideKey" : "local.showKey")}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onRotate}>
          {t(github ? "local.rotateGitHub" : "local.rotateWebhook")}
        </Button>
      </div>
    </FieldGroup>
  );
}
