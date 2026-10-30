import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { Switch } from "@raypx/ui/components/ui/switch";
import { authClient } from "../../auth/client";
import { configurationClient, configurationError, type Configuration } from "../client";

const row =
  "grid gap-5 border-b border-border py-7 sm:grid-cols-[minmax(0,1fr)_minmax(200px,1fr)] sm:gap-10";

export function ConfigurationSettings() {
  const t = useTranslations("configuration");
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
  return (
    <section>
      <header className="mb-3">
        <h1>{t("title")}</h1>
        <p className="mt-2 max-w-[65ch] text-muted-foreground">{t("intro")}</p>
      </header>
      {session.error ? (
        <div className="space-y-4 py-8">
          <p role="alert">{t("unavailable")}</p>
          <Button
            variant="outline"
            disabled={session.isPending}
            onClick={() => void session.refetch()}
          >
            {t("retry")}
          </Button>
        </div>
      ) : !session.isPending && !accountId ? (
        <p role="alert" className="py-8">
          {t("forbidden")}
        </p>
      ) : query.isError ? (
        <div className="space-y-4 py-8">
          <p role="alert">{t(configurationError(query.error))}</p>
          {configurationError(query.error) !== "forbidden" && (
            <Button
              variant="outline"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              {t("retry")}
            </Button>
          )}
        </div>
      ) : query.data ? (
        <ConfigurationForm
          key={`${accountId}:${query.data.revision}`}
          configuration={query.data}
          accountId={accountId!}
        />
      ) : (
        <div role="status" aria-label={t("loading")} className="space-y-8 py-8">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-20 rounded-md bg-muted motion-safe:animate-pulse" />
          ))}
        </div>
      )}
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
  const t = useTranslations("configuration");
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
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && dirty && !conflict && values.siteName.trim()) save.mutate();
      }}
    >
      <fieldset disabled={busy} className="min-w-0">
        <div className={row}>
          <div>
            <label htmlFor="site-name" className="text-[15px] font-medium">
              {t("siteName")}
            </label>
            <p id="site-name-hint" className="mt-1.5 text-[13px] text-muted-foreground">
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
            className="h-10"
          />
        </div>
        <div className={row}>
          <div>
            <label htmlFor="registration" className="text-[15px] font-medium">
              {t("registration")}
            </label>
            <p id="registration-hint" className="mt-1.5 text-[13px] text-muted-foreground">
              {t("registrationHint")}
            </p>
          </div>
          <div className="sm:justify-self-end">
            <Switch
              id="registration"
              aria-describedby="registration-hint"
              checked={values.registrationEnabled}
              onCheckedChange={(checked) => change({ ...values, registrationEnabled: checked })}
            />
          </div>
        </div>
        <div className={row}>
          <div>
            <label htmlFor="cleanup" className="text-[15px] font-medium">
              {t("cleanup")}
            </label>
            <p id="cleanup-hint" className="mt-1.5 text-[13px] text-muted-foreground">
              {t("cleanupHint")}
            </p>
          </div>
          <div className="sm:justify-self-end">
            <Switch
              id="cleanup"
              aria-describedby="cleanup-hint cleanup-state"
              checked={values.cleanupEnabled}
              onCheckedChange={(checked) => change({ ...values, cleanupEnabled: checked })}
            />
          </div>
          <p id="cleanup-state" className="text-[13px] text-muted-foreground sm:col-span-2">
            {t(saved.deployment.jobsEnabled ? "jobsAvailable" : "jobsDisabled")}
          </p>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 py-6">
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
          {t("discard")}
        </Button>
        {dirty && !notice && <span className="text-sm text-muted-foreground">{t("unsaved")}</span>}
        {notice && (
          <span role="status" className="text-sm">
            {t("saved")}
          </span>
        )}
      </div>
      {(save.isError || reload.isError) && (
        <div className="space-y-3 pb-6">
          <p role="alert" className="text-sm text-destructive">
            {t(configurationError(reload.error ?? save.error))}
          </p>
          {conflict && (
            <Button type="button" variant="outline" disabled={busy} onClick={() => reload.mutate()}>
              {t("reload")}
            </Button>
          )}
        </div>
      )}
      <section
        className="space-y-2 border-t border-border pt-6 text-[13px] text-muted-foreground"
        aria-label={t("deployment")}
      >
        <h2 className="text-sm font-medium text-foreground">{t("deployment")}</h2>
        <p>{t("deploymentHint")}</p>
        <p>{t(saved.deployment.mailConfigured ? "mailReady" : "mailMissing")}</p>
      </section>
    </form>
  );
}
