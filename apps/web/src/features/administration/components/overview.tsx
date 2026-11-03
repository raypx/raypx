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
import { Badge } from "@raypx/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@raypx/ui/components/ui/table";
import { administrationClient } from "../client";
import { authClient, apiUrl } from "../../auth/client";
import { LoadingState } from "@raypx/ui/loading-state";
export function Overview() {
  const c = useTranslations("common"),
    t = useTranslations("administration");
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
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1>{c("overview")}</h1>
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
          <Button
            variant="outline"
            onClick={() => {
              void data.refetch();
              void health.refetch();
            }}
          >
            {c("refresh")}
          </Button>
        </div>
      </header>
      {data.isError ? (
        <p role="alert">{c("networkError")}</p>
      ) : !data.data ? (
        <LoadingState label={c("loading")} />
      ) : (
        <>
          <dl className="flex flex-wrap gap-x-12 gap-y-5 border-b border-border pb-6">
            {(
              [
                [t("totalUsers"), data.data.totalUsers],
                [t("verifiedUsers"), data.data.verifiedUsers],
                [t("newUsers"), data.data.newUsers],
              ] as const
            ).map(([label, count]) => (
              <div key={label}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums">{count}</dd>
              </div>
            ))}
          </dl>
          <section aria-label={t("registrations")} className="flex flex-col gap-4">
            <h2>
              {t("registrations")}{" "}
              <span className="text-sm font-normal text-muted-foreground">UTC</span>
            </h2>
            <svg
              viewBox={`0 0 ${Number(days) * 20} 120`}
              role="img"
              aria-label={t("registrations")}
              className="h-36 w-full"
            >
              <title>{t("registrations")}</title>
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
            <Collapsible>
              <CollapsibleTrigger render={<Button variant="outline" />}>
                {t("dailyData")}
              </CollapsibleTrigger>
              <CollapsibleContent>
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
      <section className="flex flex-col gap-4">
        <h2>{t("health")}</h2>
        <p className="text-sm text-muted-foreground">{t("instanceHealth")}</p>
        {health.isError ? (
          <p role="alert">{c("networkError")}</p>
        ) : !health.data ? (
          <LoadingState label={c("loading")} />
        ) : (
          <>
            <ul className="flex flex-wrap gap-5">
              {(["database", "redis", "relay"] as const).map((name) => (
                <li key={name} className="flex items-center gap-2">
                  <span>{t(name)}</span>
                  <Badge variant="secondary">{t(health.data.checks[name])}</Badge>
                </li>
              ))}
            </ul>
            <time className="text-xs text-muted-foreground" dateTime={health.data.observedAt}>
              {health.data.observedAt}
            </time>
          </>
        )}
      </section>
    </section>
  );
}
