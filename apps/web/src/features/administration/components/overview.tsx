import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@raypx/i18n/browser";
import { SelectField } from "@raypx/ui/select-field";
import { Button } from "@raypx/ui/components/ui/button";
import { StatusBadge } from "@raypx/ui/status-badge";
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
import { administrationClient } from "../client.ts";
import { authClient, apiUrl } from "../../auth/client.ts";
import { LoadingState } from "@raypx/ui/loading-state";
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
  const maximum = Math.max(1, ...(data.data?.registrations.map((row) => row.count) ?? []));
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
                { value: "7", label: t("sevenDays") },
                { value: "30", label: t("thirtyDays") },
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
            <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
              <svg
                preserveAspectRatio="none"
                viewBox={`0 0 ${Number(days) * 20} 120`}
                role="img"
                aria-label={t("registrations")}
                className="h-36 w-full"
              >
                <title>{t("registrations")}</title>
                <line
                  x1="0"
                  x2={Number(days) * 20}
                  y1="110"
                  y2="110"
                  stroke="var(--color-border)"
                  vectorEffect="non-scaling-stroke"
                />
                {data.data.registrations.map((row, index) => (
                  <rect
                    key={row.day}
                    x={index * 20 + 2}
                    y={110 - (row.count / maximum) * 100}
                    width={16}
                    height={(row.count / maximum) * 100}
                    fill="currentColor"
                  >
                    <title>
                      {row.day}: {row.count}
                    </title>
                  </rect>
                ))}
              </svg>
              <div
                aria-hidden="true"
                className="flex justify-between gap-3 text-xs tabular-nums text-muted-foreground"
              >
                <span>{data.data.registrations[0]?.day}</span>
                <span>{data.data.registrations.at(-1)?.day}</span>
              </div>
            </div>
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
                    label={t(health.data.checks[name])}
                    tone={
                      health.data.checks[name] === "ok"
                        ? "success"
                        : health.data.checks[name] === "unavailable"
                          ? "danger"
                          : "neutral"
                    }
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
