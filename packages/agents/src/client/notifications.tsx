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
      <PopoverContent align="start" className="w-80">
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
          <p role="alert" className="text-xs text-destructive">
            {t("notifications.error")}
          </p>
        )}
        {!view.items.length && !view.loading && !view.error && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {t("notifications.empty")}
          </p>
        )}
        <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
          {view.items.map((item) => (
            <li key={JSON.stringify([item.spaceId, item.kind, item.sourceId])}>
              <Button
                variant="ghost"
                className="h-auto w-full justify-start py-2 text-left"
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
                  <span className="truncate">{t(`notifications.${item.kind}`)}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {item.spaceName} · {new Date(item.createdAt).toLocaleString()}
                  </span>
                </span>
                {item.unread && <Badge variant="secondary">{t("notifications.new")}</Badge>}
              </Button>
            </li>
          ))}
        </ul>
        {view.truncated && (
          <p className="text-xs text-muted-foreground">{t("notifications.truncated")}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
