import { ArrowRight, FolderSimple } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RefreshButton } from "../features/shell/route-state";
import { Button } from "@voidmix/ui/components/ui/button";
import { PageHeader } from "@voidmix/ui/page-header";
import { EmptyState } from "@voidmix/ui/empty-state";
import { StatusBadge } from "@voidmix/ui/status-badge";
import { useDesktopTranslations, useFormatter } from "../i18n/client";
import { formatCloudTime } from "../i18n/time";
import { loadCloudSnapshot, formatBytes } from "../lib/cloud";
import { formatJobDetail } from "./-job-detail";

export const Route = createFileRoute("/")({
  ssr: false,
  loader: ({ abortController }) => loadCloudSnapshot({ signal: abortController.signal }),
  component: OverviewPage,
});

function OverviewPage() {
  const t = useDesktopTranslations("overview");
  const activity = useDesktopTranslations("activity");
  const formatter = useFormatter();
  const result = Route.useLoaderData();
  const loading = Route.useMatch({ select: (match) => Boolean(match.isFetching) });
  const snapshot = result.source === "cloud" ? result.snapshot : null;
  return (
    <div className="page overview-page flex flex-col gap-7 w-full max-w-350 m-auto p-8 [&_>_header_h1]:text-[24px] [&_h2]:text-[18px] [&_h2]:font-semibold [&_p]:wrap-anywhere [&_[data-slot=badge]]:text-[12px]">
      <PageHeader
        title={t("title")}
        description={t("workbenchDescription")}
        action={<RefreshButton routeId={Route.id} />}
      />
      <section className="overview-entry flex items-center gap-5 p-6 rounded-[12px] border border-border bg-card [&_>_svg]:shrink-0 [&_>_svg]:text-primary [&_>_div]:flex-1 [&_p]:mt-1.5 [&_p]:text-muted-foreground">
        <FolderSimple size={28} aria-hidden="true" />
        <div>
          <h2>{t("projectsTitle")}</h2>
          <p>{t("projectsDescription")}</p>
        </div>
        <Button nativeButton={false} render={<Link to="/projects" />}>
          {t("openProjects")}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </section>
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("refreshing")}
        </p>
      ) : null}
      {!snapshot ? (
        <EmptyState
          title={t(
            result.source === "unconfigured"
              ? "notConfigured"
              : result.source === "offline"
                ? "offline"
                : "overviewUnavailable",
          )}
          description={t(
            result.source === "unconfigured"
              ? "notConfiguredDescription"
              : result.source === "offline"
                ? "offlineDescription"
                : "overviewUnavailableDescription",
          )}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <StatusBadge label={t("cloudData")} tone="success" />
            <span className="text-xs text-muted-foreground">
              {t("checked", { time: formatCloudTime(formatter, snapshot.lastChecked) })}
            </span>
          </div>
          <dl className="metric-row grid grid-cols-3 gap-6 py-6 border-y border-border [&_dt]:text-[12px] [&_dt]:text-muted-foreground [&_span]:text-[12px] [&_span]:text-muted-foreground [&_a]:text-[12px] [&_a]:text-muted-foreground [&_a]:text-primary [&_dd]:text-[24px] [&_dd]:font-semibold [&_dd]:my-2 [&_dd]:mx-0">
            <div>
              <dt>{t("cloudStorage")}</dt>
              <dd>{formatBytes(snapshot.storage.used, formatter)}</dd>
              <span>{t("ofTotal", { total: formatBytes(snapshot.storage.total, formatter) })}</span>
            </div>
            <div>
              <dt>{t("filesIndexed")}</dt>
              <dd>{formatter.number(snapshot.fileCount)}</dd>
              <span>{t("newThisWeek", { count: snapshot.newThisWeek })}</span>
            </div>
            <div>
              <dt>{t("activeDevices")}</dt>
              <dd>{formatter.number(snapshot.devices.filter((device) => device.online).length)}</dd>
              <Link to="/devices">{t("manageDevices")}</Link>
            </div>
          </dl>
          <section
            className="overview-queue [&_ul]:p-0 [&_ul]:mt-5 [&_ul]:list-none [&_li]:grid [&_li]:grid-cols-[minmax(0,_1fr)_120px_100px] [&_li]:items-center [&_li]:gap-6 [&_li]:py-5 [&_li]:px-0 [&_li]:border-b [&_li]:border-border [&_p]:text-muted-foreground [&_p]:text-[12px] [&_progress]:w-full [&_progress]:accent-primary"
            aria-labelledby="queue-title"
          >
            <h2 id="queue-title">{t("transferQueue")}</h2>
            {snapshot.jobs.length ? (
              <ul>
                {snapshot.jobs.map((job) => (
                  <li key={job.id}>
                    <div>
                      <strong>{job.nameKey ? activity(job.nameKey) : job.name}</strong>
                      <p>{formatJobDetail(job.detail, t, formatter)}</p>
                    </div>
                    <progress
                      max={100}
                      value={job.progress}
                      aria-label={t("percentComplete", { percent: job.progress })}
                    />
                    <StatusBadge
                      label={t(
                        job.status === "complete"
                          ? "done"
                          : job.status === "queued"
                            ? "queued"
                            : "active",
                      )}
                      tone={job.status === "complete" ? "success" : "info"}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">{t("emptyQueue")}</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
