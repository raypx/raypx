import { useTranslations } from "../../../i18n.js";
import { BootstrapOnboarding } from "./bootstrap-onboarding.js";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { Switch } from "@raypx/ui/components/ui/switch";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Skeleton } from "@raypx/ui/components/ui/skeleton";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import {
  Tabs,
  TabsContent,
  TabsIndicator,
  TabsList,
  TabsTrigger,
} from "@raypx/ui/components/ui/tabs";
import { ArchiveIcon } from "@raypx/icons/archive";
import { InfoIcon } from "@raypx/icons/info";
import { MailIcon } from "@raypx/icons/mail";
import { SettingsIcon } from "@raypx/icons/settings";
import { PageHeader } from "@raypx/ui/page-header";
import { authClient } from "../../auth/client.js";
import { configurationClient, configurationError, type Configuration } from "../client.js";
import { ConfigurationActions } from "./actions.js";
import { StorageSettings } from "./storage.js";
import { ResendSettings } from "./resend.js";

const row =
  "grid items-start gap-3 px-4 py-4 sm:px-6 @xl/main:grid-cols-[minmax(0,1fr)_minmax(12rem,15rem)] @xl/main:items-center @xl/main:gap-x-6";
const panel =
  "rounded-xl border border-border bg-card text-card-foreground focus-visible:ring-2 focus-visible:ring-ring";
const tabTrigger =
  "relative z-10 gap-2 px-2 sm:px-3 group-has-[[data-config-indicator]:not([hidden])]/tabs-list:data-active:bg-transparent group-has-[[data-config-indicator]:not([hidden])]/tabs-list:data-active:shadow-none dark:group-has-[[data-config-indicator]:not([hidden])]/tabs-list:data-active:border-transparent dark:group-has-[[data-config-indicator]:not([hidden])]/tabs-list:data-active:bg-transparent";

export function ConfigurationSettings({
  initialTab = "site",
  setup = false,
}: { initialTab?: "site" | "resend"; setup?: boolean } = {}) {
  const common = useTranslations("common");
  const t = useTranslations("site");
  const session = authClient.useSession();
  const accountId = session.data?.user.id ?? null;
  const [tab, setTab] = useState<string>(initialTab);
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
        <div className="flex flex-col items-start gap-4 p-4 sm:p-6">
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
        <p role="alert" className="p-4 sm:p-6">
          {t("forbidden")}
        </p>
      );
    if (query.isError) {
      const failure = configurationError(query.error);
      return (
        <div className="flex flex-col items-start gap-4 p-4 sm:p-6">
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
      <div role="status" aria-label={t("loading")} className="flex flex-col gap-4 p-4 sm:p-6">
        {[1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }
  return (
    <section className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t("title")} description={t("intro")} />
      {setup && <BootstrapOnboarding />}
      {accountId && !session.error ? (
        <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="gap-4">
          <TabsList
            aria-label={t("title")}
            className="relative isolate w-full justify-start sm:w-fit"
          >
            <TabsTrigger value="site" className={tabTrigger}>
              <SettingsIcon aria-hidden="true" className="hidden sm:block" />
              {t("siteTab")}
            </TabsTrigger>
            <TabsTrigger value="storage" className={tabTrigger}>
              <ArchiveIcon aria-hidden="true" className="hidden sm:block" />
              {t("storage.title")}
            </TabsTrigger>
            <TabsTrigger value="resend" className={tabTrigger}>
              <MailIcon aria-hidden="true" className="hidden sm:block" />
              {t("mail.title")}
            </TabsTrigger>
            <TabsIndicator
              aria-hidden="true"
              data-config-indicator=""
              className="pointer-events-none absolute top-(--active-tab-top) left-0 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) rounded-md bg-background shadow-sm motion-safe:transition-[translate,width] motion-safe:duration-150 motion-safe:ease-out group-has-[:focus-visible]/tabs-list:transition-none dark:bg-input/30"
            />
          </TabsList>
          <TabsContent value="site" keepMounted className={panel} hidden={tab !== "site"}>
            {content()}
          </TabsContent>
          <TabsContent value="storage" keepMounted className={panel} hidden={tab !== "storage"}>
            <StorageSettings key={accountId} accountId={accountId} active={tab === "storage"} />
          </TabsContent>
          <TabsContent value="resend" keepMounted className={panel} hidden={tab !== "resend"}>
            <ResendSettings key={accountId} accountId={accountId} active={tab === "resend"} />
          </TabsContent>
        </Tabs>
      ) : (
        content()
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
      <fieldset disabled={busy} className="min-w-0">
        <FieldGroup className="gap-0 divide-y divide-border">
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
              className="rounded-md bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground @xl/main:col-span-2"
            >
              {t(saved.deployment.jobsEnabled ? "jobsAvailable" : "jobsDisabled")}
            </p>
          </Field>
        </FieldGroup>
      </fieldset>
      <ConfigurationActions
        busy={busy}
        saving={save.isPending}
        dirty={dirty}
        saved={notice}
        canSave={!busy && dirty && !conflict && Boolean(values.siteName.trim())}
        onDiscard={() => {
          setValues(saved.values);
          setNotice(false);
          if (!conflict) save.reset();
        }}
      />
      {(save.isError || reload.isError) && (
        <div className="flex flex-col items-start gap-3 border-t border-border px-4 py-4 sm:px-6">
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
        className="flex items-start gap-2.5 border-t border-border px-4 py-4 text-sm leading-6 text-muted-foreground sm:px-6"
        aria-label={t("deployment")}
      >
        <InfoIcon aria-hidden="true" className="mt-1 size-4 shrink-0" />
        <div>
          <h2 className="font-medium text-foreground">{t("deployment")}</h2>
          <p>{t("deploymentHint")}</p>
        </div>
      </section>
    </form>
  );
}
