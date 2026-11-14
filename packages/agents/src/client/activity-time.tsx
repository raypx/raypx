import { useEffect, useState } from "react";
import { useLocale } from "@raypx/i18n/browser";
import { relativeActivityTime } from "../model/activity.js";
import { useTranslations } from "./i18n.js";

export function ActivityTime({ value }: { value?: string | null | undefined }) {
  const locale = useLocale();
  const t = useTranslations("agents");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!value) return;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [value]);
  if (!value)
    return (
      <span className="truncate text-xs font-normal text-muted-foreground">
        {t("activity.none")}
      </span>
    );
  return (
    <time
      dateTime={value}
      title={new Date(value).toLocaleString(locale)}
      className="truncate text-xs font-normal text-muted-foreground"
    >
      {t("activity.active", { time: relativeActivityTime(value, locale, now) })}
    </time>
  );
}
