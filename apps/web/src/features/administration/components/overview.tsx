import { useTranslations } from "../../../i18n.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { SelectField } from "@raypx/ui/select-field";
import { Button } from "@raypx/ui/components/ui/button";
import { StatusBadge, type StatusTone } from "@raypx/ui/status-badge";
import { cn } from "@raypx/ui/lib/utils";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { PageHeader } from "@raypx/ui/page-header";
import { IconButton } from "@raypx/ui/icon-button";
import { RefreshIcon } from "@raypx/icons/refresh";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@raypx/ui/components/ui/table";
import { administrationClient } from "../client.js";
import { authClient, apiUrl } from "../../auth/client.js";
import { LoadingState } from "@raypx/ui/loading-state";

type Registration = { day: string; count: number };

function healthTone(state: string): StatusTone {
  if (state === "ok") return "success";
  if (state === "unavailable") return "danger";
  return "neutral";
}

function tooltipAlignment(index: number, last: number) {
  if (index === 0) return "left-0";
  if (index === last) return "right-0";
  return "left-1/2 -translate-x-1/2";
}

/**
 * Daily registrations as thin columns on one baseline. The peak and the latest day carry
 * direct labels, every column shows its value on hover, and the table keeps all numbers.
 */
function RegistrationChart({ rows, label }: { rows: readonly Registration[]; label: string }) {
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  const last = rows.length - 1;
  const peak = rows.reduce(
    (best, row, index) => (row.count > (rows[best]?.count ?? 0) ? index : best),
    0,
  );
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <div role="img" aria-label={label} className="relative h-44 pt-6">
        <div aria-hidden="true" className="flex h-full items-end gap-0.5 border-b border-border">
          {rows.map((row, index) => {
            const height = (row.count / maximum) * 100;
            const labelled = row.count > 0 && (index === peak || index === last);
            return (
              <div
                key={row.day}
                className="group relative flex h-full min-w-0 flex-1 items-end justify-center"
              >
                {row.count > 0 && (
                  <div
                    style={{ height: `${height}%` }}
                    className="w-full max-w-6 rounded-t-[4px] bg-foreground/70 group-hover:bg-foreground motion-safe:transition-colors motion-safe:duration-150"
                  />
                )}
                {labelled && (
                  <span
                    style={{ bottom: `calc(${height}% + 0.25rem)` }}
                    className="absolute left-1/2 -translate-x-1/2 text-xs font-medium tabular-nums group-hover:opacity-0"
                  >
                    {row.count}
                  </span>
                )}
                <span
                  style={{ bottom: `calc(${height}% + 0.5rem)` }}
                  className={cn(
                    "pointer-events-none absolute z-10 flex flex-col rounded-md border border-border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-popover group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-150",
                    tooltipAlignment(index, last),
                  )}
                >
                  <span className="font-semibold tabular-nums">{row.count}</span>
                  <span className="text-muted-foreground tabular-nums">{row.day}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {rows.length <= 14 ? (
        <div aria-hidden="true" className="flex gap-0.5 text-xs tabular-nums text-muted-foreground">
          {rows.map((row) => (
            <span key={row.day} className="min-w-0 flex-1 truncate text-center">
              {row.day.slice(5)}
            </span>
          ))}
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="flex justify-between gap-3 text-xs tabular-nums text-muted-foreground"
        >
          <span>{rows[0]?.day}</span>
          <span>{rows.at(-1)?.day}</span>
        </div>
      )}
    </div>
  );
}

export function Overview() {
  const c = useTranslations("common"),
    t = useTranslations("dash");
  const session = authClient.useSession();
  const id = session.data?.user.id;
  const [days, setDays] = useState<"7" | "30">("30");
  const data = useQuery({
    queryKey: ["admin-overview", apiUrl, id, days],
    queryFn: ({ signal }) =>
      administrationClient.overview({ days: days === "7" ? 7 : 30 }, { signal }),
    enabled: Boolean(id),
    retry: false,
    staleTime: 30000,
  });
  const health = useQuery({
    queryKey: ["admin-health", apiUrl, id],
    queryFn: ({ signal }) => administrationClient.health({}, { signal }),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: 30000,
  });
  return (
    <section className="flex min-w-0 flex-col gap-8">
      <PageHeader
        title={t("nav.overview")}
        action={
          <div className="flex items-center gap-2">
            <SelectField
              aria-label={t("period")}
              value={days}
              onValueChange={setDays}
              options={[
                { value: "7", label: t("lastDays", { days: 7 }) },
                { value: "30", label: t("lastDays", { days: 30 }) },
              ]}
            />
            <IconButton
              label={c("refresh")}
              disabled={data.isFetching || health.isFetching}
              onClick={() => {
                void data.refetch();
                void health.refetch();
              }}
            >
              <RefreshIcon aria-hidden="true" />
            </IconButton>
          </div>
        }
      />
      {data.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{c("networkError")}</AlertDescription>
        </Alert>
      ) : !data.data ? (
        <LoadingState label={c("loading")} />
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-4 border-y border-border py-5 @md/main:grid-cols-3 @md/main:gap-8">
            {(
              [
                [t("totalUsers"), data.data.totalUsers],
                [t("verifiedUsers"), data.data.verifiedUsers],
                [t("newUsers"), data.data.newUsers],
              ] as const
            ).map(([label, count]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-3 @md/main:flex-col @md/main:items-start @md/main:gap-2"
              >
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{count}</dd>
              </div>
            ))}
          </dl>
          <section
            aria-label={t("registrations")}
            aria-busy={data.isFetching}
            className="flex min-w-0 flex-col gap-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium">{t("registrations")}</h2>
              <span className="text-xs text-muted-foreground">UTC</span>
            </div>
            <RegistrationChart rows={data.data.registrations} label={t("registrations")} />
            <Collapsible>
              <CollapsibleTrigger render={<Button variant="outline" />}>
                {t("dailyData")}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <Table aria-label={t("registrations")}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("day")}</TableHead>
                      <TableHead>{t("newUsers")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.data.registrations.map((row) => (
                      <TableRow key={row.day}>
                        <TableCell>{row.day}</TableCell>
                        <TableCell>{row.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </Collapsible>
          </section>
        </>
      )}
      <section
        aria-labelledby="admin-health-title"
        aria-busy={health.isFetching}
        className="flex flex-col gap-4 border-t border-border pt-6"
      >
        <div className="flex flex-col gap-1">
          <h2 id="admin-health-title" className="text-lg font-medium">
            {t("health")}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">{t("instanceHealth")}</p>
        </div>
        {health.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{c("networkError")}</AlertDescription>
          </Alert>
        ) : !health.data ? (
          <LoadingState label={c("loading")} />
        ) : (
          <>
            <ul className="grid gap-x-8 @xl/main:grid-cols-3">
              {(["database", "redis", "relay"] as const).map((name) => (
                <li
                  key={name}
                  className="flex items-center justify-between gap-4 border-b border-border py-3"
                >
                  <span>{t(name)}</span>
                  <StatusBadge
                    label={
                      health.data.checks[name] === "not-configured"
                        ? c("unconfigured")
                        : t(health.data.checks[name])
                    }
                    tone={healthTone(health.data.checks[name])}
                  />
                </li>
              ))}
            </ul>
            <time className="text-xs text-muted-foreground" dateTime={health.data.observedAt}>
              {health.data.observedAt.replace("T", " ").replace(/\.\d+Z$/, " UTC")}
            </time>
          </>
        )}
      </section>
    </section>
  );
}
