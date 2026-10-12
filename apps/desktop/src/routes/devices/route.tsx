import { DeviceMobile, Laptop, Monitor } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@voidmix/ui/empty-state";
import { cn } from "@voidmix/ui/lib/utils";
import { PageHeader } from "@voidmix/ui/page-header";
import { RefreshButton } from "../../features/shell/route-state";
import { useDesktopTranslations, useFormatter } from "../../i18n/client";
import { formatCloudTime } from "../../i18n/time";
import { loadCloudSnapshot, formatBytes } from "../../lib/cloud";

export const Route = createFileRoute("/devices")({
  ssr: false,
  loader: ({ abortController }) => loadCloudSnapshot({ signal: abortController.signal }),
  component: DevicesPage,
});

function DevicesPage() {
  const t = useDesktopTranslations("devices");
  const formatter = useFormatter();
  const result = Route.useLoaderData();
  const devices = result.source === "cloud" ? result.snapshot.devices : [];
  return (
    <div className="page flex flex-col gap-7 w-full max-w-350 m-auto p-8 [&_>_header_h1]:text-[24px] [&_h2]:text-[18px] [&_h2]:font-semibold [&_p]:wrap-anywhere [&_[data-slot=badge]]:text-[12px]">
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={<RefreshButton routeId={Route.id} />}
      />
      {result.source !== "cloud" ? (
        <EmptyState title={t("unavailable")} description={t("unavailableDescription")} />
      ) : devices.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyDescription")} />
      ) : null}
      <section className="device-list flex flex-col" aria-label={t("registered")}>
        {devices.map((device) => {
          const Icon =
            device.kind === "phone" ? DeviceMobile : device.kind === "desktop" ? Monitor : Laptop;
          return (
            <article
              className="device-row grid grid-cols-[32px_minmax(100px,_1fr)_90px_120px_100px] gap-4 items-center py-5 px-0 border-b border-border [&_strong]:font-medium [&_strong]:wrap-anywhere [@media(max-width:1023px)]:grid-cols-[32px_minmax(0,_1fr)_80px]"
              key={device.id}
            >
              <span className="device-icon">
                <Icon size={20} />
              </span>
              <div className="device-name flex flex-col gap-1 [&_span]:text-[12px] [&_span]:text-muted-foreground">
                <strong>{device.name}</strong>
                <span>{device.platform}</span>
              </div>
              <div>
                <span
                  className={cn(
                    "presence text-xs leading-[1.6] text-muted-foreground",
                    device.online && "online text-success",
                  )}
                >
                  {device.online ? t("online") : t("offline")}
                </span>
              </div>
              <div className="device-meta flex flex-col gap-1 [&_span]:text-[12px] [&_span]:text-muted-foreground [@media(max-width:1023px)]:[grid-column:2]">
                <span>{t("lastSeen")}</span>
                <strong>{formatCloudTime(formatter, device.lastSeen)}</strong>
              </div>
              <div className="device-meta flex flex-col gap-1 [&_span]:text-[12px] [&_span]:text-muted-foreground [@media(max-width:1023px)]:[grid-column:2]">
                <span>{t("synced")}</span>
                <strong>{formatBytes(device.syncedBytes, formatter)}</strong>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
