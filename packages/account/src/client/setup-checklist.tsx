import { cn } from "@raypx/ui/lib/utils";
import { useEffect, useId, useMemo, useSyncExternalStore } from "react";
import { SetupChecklistController, type SetupChecklistPort } from "../model.js";
import { useTranslations } from "./i18n.js";
import { Alert, AlertTitle, AlertDescription, AlertAction } from "@raypx/ui/components/ui/alert";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { IconButton } from "@raypx/ui/icon-button";
import { CloseIcon } from "@raypx/icons/close";
import { CheckCircleIcon } from "@raypx/icons/check-circle";
import { CircleIcon } from "@raypx/icons/circle";

export type SetupItem = "model" | "sandbox" | "mail";
export interface SetupChecklistProps {
  port: SetupChecklistPort;
  origin: string;
  accountId: string;
  destinations: Record<SetupItem, string>;
  onConfigure(this: void, item: SetupItem): void;
}

/** Mounted by the workspace notice slot; configuration never blocks the workspace. */
export function SetupChecklist(props: SetupChecklistProps) {
  return <ScopedChecklist key={JSON.stringify([props.origin, props.accountId])} {...props} />;
}
function ScopedChecklist({
  port,
  origin,
  accountId,
  destinations,
  onConfigure,
}: SetupChecklistProps) {
  const t = useTranslations("access");
  const titleId = useId();
  const controller = useMemo(
    () =>
      new SetupChecklistController(port, origin, accountId, {
        read: (key) => localStorage.getItem(key),
        write: (key, value) => localStorage.setItem(key, value),
      }),
    [port, origin, accountId],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "hidden") void controller.refresh();
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", refresh);
      controller.dispose();
    };
  }, [controller]);
  if (state.status === "hidden") return null;
  return (
    <div className="shrink-0 px-4 pt-4 sm:px-6" data-setup-checklist>
      <Alert role="region" aria-labelledby={titleId} className="rounded-xl p-3">
        <AlertTitle>
          <h2 id={titleId}>{t("setup.title")}</h2>
        </AlertTitle>
        <AlertAction>
          <IconButton
            label={t("setup.dismiss")}
            size="icon-sm"
            onClick={() => controller.dismiss()}
          >
            <CloseIcon aria-hidden="true" />
          </IconButton>
        </AlertAction>
        <AlertDescription>
          {state.status === "unavailable" ? (
            <div className="flex items-center gap-3 text-danger-text">
              <span>{t("setup.unavailable")}</span>
              <Button size="sm" variant="outline" onClick={() => void controller.refresh()}>
                {t("setup.retry")}
              </Button>
            </div>
          ) : (
            <ul className="mt-2 grid gap-3 @3xl/main:grid-cols-3">
              {(["model", "sandbox", "mail"] as const).map((item) => {
                const configured = state.configuration[item];
                const Icon = configured ? CheckCircleIcon : CircleIcon;
                return (
                  <li
                    key={item}
                    className={cn(
                      "flex min-w-0 items-start gap-2 rounded-lg border p-2",
                      configured
                        ? "border-success-border bg-success-bg text-success-text"
                        : "border-warning-border bg-warning-bg text-warning-text",
                    )}
                  >
                    <Icon aria-hidden="true" className="mt-1 size-4 shrink-0" />
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <a
                          href={destinations[item]}
                          className={buttonVariants({
                            variant: "link",
                            size: "sm",
                            className: "justify-start px-0",
                          })}
                          onClick={(event) => {
                            if (
                              event.button !== 0 ||
                              event.metaKey ||
                              event.ctrlKey ||
                              event.shiftKey ||
                              event.altKey
                            )
                              return;
                            event.preventDefault();
                            onConfigure(item);
                          }}
                        >
                          {t(`setup.${item}`)}
                        </a>
                        <Badge variant="secondary">
                          {t(item === "model" ? "setup.required" : "setup.optional")}
                        </Badge>
                      </div>
                      <span className="text-xs">
                        {t(configured ? "setup.configured" : "setup.notConfigured")}
                      </span>
                      {!configured && <span className="text-xs">{t(`setup.${item}Hint`)}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}
