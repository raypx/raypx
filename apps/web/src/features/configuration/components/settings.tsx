import { useTranslations } from "../../../i18n.js";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { Switch } from "@raypx/ui/components/ui/switch";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Skeleton } from "@raypx/ui/components/ui/skeleton";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { PageHeader } from "@raypx/ui/page-header";
import { authClient } from "../../auth/client.js";
import { configurationClient, configurationError, type Configuration } from "../client.js";

const row =
  "grid items-start gap-4 border-b border-border py-5 @xl/main:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] @xl/main:items-center @xl/main:gap-x-8";

export function ConfigurationSettings() {
  const common = useTranslations("common");
  const t = useTranslations("site");
  const session = authClient.useSession();
  const accountId = session.data?.user.id ?? null;
  const query = useQuery({
    queryKey: ["configuration", "admin", accountId],
    queryFn: ({ signal }) => configurationClient.get({}, { signal }),
    enabled: Boolean(accountId),
    retry: false,
    // Background reads must not replace an administrator's unsaved form.
    refetchOnWindowFocus: false,
  });
  function content() {
    if (session.error)
      return (
        <div className="flex flex-col items-start gap-4 py-8">
          <Alert variant="destructive">
            <AlertDescription>{t("unavailable")}</AlertDescription>
          </Alert>
          <Button
            variant="outline"
            disabled={session.isPending}
            onClick={() => void session.refetch()}
          >
            {common("retry")}
          </Button>
        </div>
      );
    if (!session.isPending && !accountId)
      return (
        <p role="alert" className="py-8">
          {t("forbidden")}
        </p>
      );
    if (query.isError) {
      const failure = configurationError(query.error);
      return (
        <div className="flex flex-col items-start gap-4 py-8">
          <Alert variant="destructive">
            <AlertDescription>{t(failure)}</AlertDescription>
          </Alert>
          {failure !== "forbidden" && (
            <Button
              variant="outline"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              {common("retry")}
            </Button>
          )}
        </div>
      );
    }
    if (query.data)
      return (
        <ConfigurationForm
          key={`${accountId}:${query.data.revision}`}
          configuration={query.data}
          accountId={accountId!}
        />
      );
    return (
      <div role="status" aria-label={t("loading")} className="flex flex-col gap-6 py-6">
        {[1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }
  return (
    <section className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />
      {content()}
    </section>
  );
}

export function ConfigurationForm({
  configuration,
  accountId,
}: {
  configuration: Configuration;
  accountId: string;
}) {
  const common = useTranslations("common");
  const t = useTranslations("site");
  const client = useQueryClient();
  const [saved, setSaved] = useState(configuration);
  const [values, setValues] = useState(configuration.values);
  const [notice, setNotice] = useState(false);
  const [conflict, setConflict] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(saved.values);
  const save = useMutation({
    mutationFn: () =>
      configurationClient.update({
        values: { ...values, siteName: values.siteName.trim() },
        revision: saved.revision,
      }),
    onSuccess: (snapshot) => {
      const next = { ...saved, ...snapshot };
      setSaved(next);
      setValues(snapshot.values);
      setNotice(true);
      setConflict(false);
      // Keep this form mounted so success feedback survives the new revision.
      void client.invalidateQueries({
        queryKey: ["configuration", "admin", accountId],
        refetchType: "none",
      });
      void client.invalidateQueries({ queryKey: ["configuration", "public"] });
    },
    onError: (error) => {
      if (configurationError(error) === "conflict") setConflict(true);
    },
  });
  const reload = useMutation({
    mutationFn: () => configurationClient.get({}),
    onSuccess: (next) => {
      // Keep fields this administrator edited; take everything else from the new revision.
      const merged = { ...next.values };
      for (const key of Object.keys(values) as (keyof typeof values)[])
        if (values[key] !== saved.values[key]) Object.assign(merged, { [key]: values[key] });
      setSaved(next);
      setValues(merged);
      setConflict(false);
      setNotice(false);
      save.reset();
    },
  });
  const busy = save.isPending || reload.isPending;
  function change(next: Configuration["values"]) {
    setValues(next);
    setNotice(false);
    if (!conflict) save.reset();
  }
  return (
    <form
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && dirty && !conflict && values.siteName.trim()) save.mutate();
      }}
    >
      <fieldset disabled={busy} className="min-w-0 border-t border-border">
        <FieldGroup className="gap-0">
          <Field className={row}>
            <div>
              <FieldLabel htmlFor="site-name">{t("siteName")}</FieldLabel>
              <p
                id="site-name-hint"
                className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground"
              >
                {t("siteNameHint")}
              </p>
            </div>
            <Input
              id="site-name"
              aria-describedby="site-name-hint"
              required
              maxLength={60}
              value={values.siteName}
              onChange={(e) => change({ ...values, siteName: e.target.value })}
            />
          </Field>
          <Field className={row}>
            <div>
              <FieldLabel htmlFor="registration">{t("registration")}</FieldLabel>
              <p
                id="registration-hint"
                className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground"
              >
                {t("registrationHint")}
              </p>
            </div>
            <div className="flex @xl/main:justify-end">
              <Switch
                id="registration"
                aria-describedby="registration-hint"
                checked={values.registrationEnabled}
                onCheckedChange={(checked) => change({ ...values, registrationEnabled: checked })}
              />
            </div>
          </Field>
          <Field className={row}>
            <div>
              <FieldLabel htmlFor="cleanup">{t("cleanup")}</FieldLabel>
              <p
                id="cleanup-hint"
                className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground"
              >
                {t("cleanupHint")}
              </p>
            </div>
            <div className="flex @xl/main:justify-end">
              <Switch
                id="cleanup"
                aria-describedby="cleanup-hint cleanup-state"
                checked={values.cleanupEnabled}
                onCheckedChange={(checked) => change({ ...values, cleanupEnabled: checked })}
              />
            </div>
            <p
              id="cleanup-state"
              className="text-xs leading-6 text-muted-foreground @xl/main:col-span-2"
            >
              {t(saved.deployment.jobsEnabled ? "jobsAvailable" : "jobsDisabled")}
            </p>
          </Field>
        </FieldGroup>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 py-5">
        <Button type="submit" disabled={busy || !dirty || conflict || !values.siteName.trim()}>
          {t(save.isPending ? "saving" : "save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !dirty}
          onClick={() => {
            setValues(saved.values);
            setNotice(false);
            if (!conflict) save.reset();
          }}
        >
          {common("discard")}
        </Button>
        {dirty && !notice && <span className="text-sm text-muted-foreground">{t("unsaved")}</span>}
        {notice && (
          <span role="status" className="text-sm">
            {t("saved")}
          </span>
        )}
      </div>
      {(save.isError || reload.isError) && (
        <div className="flex flex-col items-start gap-3 pb-6">
          <Alert variant="destructive">
            <AlertDescription>{t(configurationError(reload.error ?? save.error))}</AlertDescription>
          </Alert>
          {conflict && (
            <Button type="button" variant="outline" disabled={busy} onClick={() => reload.mutate()}>
              {t("reload")}
            </Button>
          )}
        </div>
      )}
      <section
        className="flex flex-col gap-2 border-t border-border pt-5 text-sm leading-6 text-muted-foreground"
        aria-label={t("deployment")}
      >
        <h2 className="text-sm font-medium text-foreground">{t("deployment")}</h2>
        <p>{t("deploymentHint")}</p>
        <p>{t(saved.deployment.mailConfigured ? "mailReady" : "mailMissing")}</p>
      </section>
    </form>
  );
}
