import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from "@raypx/ui/components/ui/popover";
import { Button } from "@raypx/ui/components/ui/button";
import { Badge } from "@raypx/ui/components/ui/badge";
import { IconButton } from "@raypx/ui/icon-button";
import { BellIcon } from "@raypx/icons/bell";
import { EmptyState } from "@raypx/ui/empty-state";
import { Skeleton } from "@raypx/ui/components/ui/skeleton";
import { useLocale } from "@raypx/i18n/browser";
import { relativeActivityTime } from "../model/activity.js";
import { NotificationsController, type MemberNotificationsPort } from "../model/notifications.js";
import type { MemberNotification } from "@raypx/core/notifications";
import { useTranslations } from "./i18n.js";
export function NotificationsBell({
  port,
  onOpen,
}: {
  port: MemberNotificationsPort;
  onOpen: (item: MemberNotification) => void;
}) {
  const t = useTranslations("agents");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const unreadId = useId();
  const controller = useMemo(() => new NotificationsController(port), [port]);
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) void controller.refresh();
    };
    refresh();
    const timer = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      controller.dispose();
    };
  }, [controller]);
  const unread = view.items.filter((item) => item.unread).length;
  const groups = new Map<string, MemberNotification[]>();
  for (const item of view.items) {
    const items = groups.get(item.spaceId) ?? [];
    if (!groups.has(item.spaceId)) groups.set(item.spaceId, items);
    items.push(item);
  }
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) void controller.refresh();
      }}
    >
      <PopoverTrigger
        render={
          <IconButton
            label={t("notifications.title")}
            size="icon-sm"
            className="relative"
            aria-describedby={unreadId}
          />
        }
      >
        <BellIcon aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute top-0 right-0 size-1.5 rounded-full bg-foreground" />
        )}
        <span id={unreadId} role="status" className="sr-only">
          {t("notifications.unread", { count: String(unread) })}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-88 max-w-[calc(100vw-2rem)] gap-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <PopoverTitle>{t("notifications.title")}</PopoverTitle>
          <Button
            size="xs"
            variant="ghost"
            disabled={view.loading}
            onClick={() => void controller.refresh()}
          >
            {t("refresh")}
          </Button>
        </div>
        {view.error && (
          <p role="alert" className="text-xs text-destructive-text">
            {t("notifications.error")}
          </p>
        )}
        {!view.items.length && !view.loading && !view.error && (
          <EmptyState
            icon={<BellIcon aria-hidden="true" />}
            title={t("notifications.empty")}
            className="py-8"
          />
        )}
        {view.loading && !view.items.length && (
          <div role="status" aria-label={t("loading")} className="flex flex-col gap-3 py-2">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-14 w-full" />
            ))}
          </div>
        )}
        <div className="flex max-h-[min(28rem,65dvh)] flex-col gap-3 overflow-y-auto overscroll-contain">
          {Array.from(groups, ([spaceId, items]) => (
            <section key={spaceId} aria-label={items[0]?.spaceName} className="min-w-0">
              <h3
                className="truncate px-2 py-1 text-xs font-medium text-muted-foreground"
                title={items[0]?.spaceName}
              >
                {items[0]?.spaceName}
              </h3>
              <ul className="flex flex-col gap-1">
                {items.map((item) => (
                  <li key={JSON.stringify([item.kind, item.sourceId])}>
                    <Button
                      variant="ghost"
                      className="h-auto w-full min-w-0 justify-start gap-3 rounded-lg px-2 py-3 text-left whitespace-normal"
                      onClick={() => {
                        void controller.read(item).then((read) => {
                          if (read) {
                            setOpen(false);
                            onOpen(item);
                          }
                        });
                      }}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className={item.unread ? "font-medium" : "text-muted-foreground"}>
                          {t(`notifications.${item.kind}`)}
                        </span>
                        <time
                          dateTime={item.createdAt}
                          title={new Date(item.createdAt).toLocaleString(locale)}
                          className="text-xs tabular-nums text-muted-foreground"
                        >
                          {relativeActivityTime(item.createdAt, locale, Date.now())}
                        </time>
                      </span>
                      {item.unread && <Badge variant="secondary">{t("notifications.new")}</Badge>}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {view.truncated && (
          <p className="text-xs text-muted-foreground">{t("notifications.truncated")}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
