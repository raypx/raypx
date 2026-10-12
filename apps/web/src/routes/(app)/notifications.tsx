import { useSuspenseQuery } from "@tanstack/react-query";
import { cloudQueries } from "../../lib/cloud-queries";
import { useCloudQueries } from "../../lib/use-cloud-queries";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@voidmix/ui/page-header";
import { Button } from "@voidmix/ui/components/ui/button";
import { LOCALE_OPTIONS } from "@voidmix/i18n";
import { Switch } from "@voidmix/ui/components/ui/switch";
import { Field, FieldLabel } from "@voidmix/ui/components/ui/field";
import { useTranslations, useFormatter } from "../../i18n/client";
import { createRouteApiClient } from "../../lib/route-api";
import { createWebApiClient } from "../../lib/api-client";
import { RouteError, RoutePending } from "../../features/navigation/route-state";
export const Route = createFileRoute("/(app)/notifications")({
  loader: async ({ context }) => {
    const queries = cloudQueries(context, createRouteApiClient());
    await Promise.all([
      context.queryClient.ensureQueryData(queries.notifications()),
      context.queryClient.ensureQueryData(queries.preferences()),
    ]);
    return { accountId: context.accountId };
  },
  component: NotificationsPage,
  pendingComponent: RoutePending,
  errorComponent: RouteError,
});
function NotificationsPage() {
  const { accountId } = Route.useLoaderData();
  return <NotificationList key={accountId} />;
}
function NotificationList() {
  const { queries, queryClient } = useCloudQueries();
  const {
    data: { items, unreadCount },
  } = useSuspenseQuery(queries.notifications());
  const { data: preferences } = useSuspenseQuery(queries.preferences());
  const t = useTranslations("cloud");
  const formatter = useFormatter();
  const api = useMemo(() => createWebApiClient(), []);
  const lifetime = useRef<AbortController | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const labels = {
    "task.review": t("notificationReview"),
    "run.failed": t("notificationFailed"),
    "task.waiting_input": t("notificationInput"),
    "task.completed": t("notificationCompleted"),
  };
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => lifetime.current?.abort();
  }, []);
  async function action(key: string, operation: (signal: AbortSignal) => Promise<unknown>) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || pending) return;
    setPending(key);
    setFailed(false);
    try {
      await operation(signal);
      if (!signal.aborted)
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queries.notifications().queryKey,
            exact: true,
          }),
          queryClient.invalidateQueries({ queryKey: queries.preferences().queryKey, exact: true }),
        ]);
    } catch {
      if (!signal.aborted) setFailed(true);
    } finally {
      if (!signal.aborted) setPending(null);
    }
  }
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("notifications")}
        description={t("unreadCount", { count: unreadCount })}
      />
      <section
        aria-label={t("notificationPreferences")}
        className="rounded-lg border border-border p-5"
      >
        <h2 className="mb-4 font-semibold">{t("notificationPreferences")}</h2>
        <Field>
          <FieldLabel htmlFor="email-notifications">{t("emailNotifications")}</FieldLabel>
          <Switch
            id="email-notifications"
            checked={preferences.emailEnabled}
            disabled={Boolean(pending)}
            onCheckedChange={(emailEnabled) =>
              void action("preferences", (signal) =>
                api.cloud.preferences.update(
                  { emailEnabled, locale: preferences.locale, idempotencyKey: crypto.randomUUID() },
                  { signal },
                ),
              )
            }
          />
          <p className="text-sm text-muted-foreground">{t("emailDescription")}</p>
        </Field>
        <Field className="mt-5">
          <FieldLabel htmlFor="notification-locale">{t("notificationLocale")}</FieldLabel>
          <select
            id="notification-locale"
            className="max-w-xs rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={preferences.locale}
            disabled={Boolean(pending)}
            onChange={(event) => {
              const locale = event.target.value as "en" | "zh";
              void action("preferences", (signal) =>
                api.cloud.preferences.update(
                  {
                    emailEnabled: preferences.emailEnabled,
                    locale,
                    idempotencyKey: crypto.randomUUID(),
                  },
                  { signal },
                ),
              );
            }}
          >
            {LOCALE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.nativeName}
              </option>
            ))}
          </select>
        </Field>
      </section>
      {failed ? <p role="alert">{t("failed")}</p> : null}
      {items.length ? (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="min-w-0">
                {item.taskId ? (
                  <Link
                    to="/tasks/$taskId"
                    params={{ taskId: item.taskId }}
                    className="text-sm font-medium hover:underline"
                  >
                    {labels[item.type]}
                  </Link>
                ) : item.conversationId ? (
                  <Link
                    to="/chat/$conversationId"
                    params={{ conversationId: item.conversationId }}
                    className="text-sm font-medium hover:underline"
                  >
                    {labels[item.type]}
                  </Link>
                ) : (
                  <p className="text-sm font-medium">{labels[item.type]}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatter.dateTime(item.createdAt, "short")}
                  {!item.readAt ? ` · ${t("unread")}` : ""}
                </p>
              </div>
              {!item.readAt ? (
                <Button
                  variant="outline"
                  disabled={Boolean(pending)}
                  onClick={() =>
                    void action(item.id, (signal) =>
                      api.cloud.notifications.markRead(
                        { notificationId: item.id, idempotencyKey: crypto.randomUUID() },
                        { signal },
                      ),
                    )
                  }
                >
                  {pending === item.id ? t("pending") : t("markRead")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{t("noNotifications")}</p>
      )}
    </div>
  );
}
