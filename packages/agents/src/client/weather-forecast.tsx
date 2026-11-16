import type { ToolActivity, WeatherForecast } from "@raypx/core/conversation";
import { useLocale } from "@raypx/i18n/browser";
import { SunIcon } from "@raypx/icons/sun";
import { CloudIcon } from "@raypx/icons/cloud";
import { CloudRainIcon } from "@raypx/icons/cloud-rain";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import { ArrowUpRightIcon } from "@raypx/icons/arrow-up-right";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@raypx/ui/components/ui/table";
import { useTranslations } from "./i18n.js";

function condition(code: number | null) {
  if (code === 0) return "clear";
  if (code === 1) return "mostlyClear";
  if (code === 2) return "partlyCloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ([51, 53, 55, 56, 57].includes(code ?? -1)) return "drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code ?? -1)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code ?? -1)) return "snow";
  if (code === 95 || code === 96 || code === 99) return "thunderstorm";
  return "unknown";
}

function WeatherIcon({ weather }: { weather: ReturnType<typeof condition> }) {
  if (weather === "clear" || weather === "mostlyClear")
    return <SunIcon aria-hidden="true" className="size-6" />;
  if (weather === "rain" || weather === "drizzle" || weather === "thunderstorm")
    return <CloudRainIcon aria-hidden="true" className="size-6" />;
  return <CloudIcon aria-hidden="true" className="size-6" />;
}

export function WeatherForecastCards({
  activity,
  delegated,
  onOpenExternal,
}: {
  activity: readonly ToolActivity[];
  delegated: readonly { activity: readonly ToolActivity[] }[];
  onOpenExternal: ((url: string) => void) | undefined;
}) {
  const forecasts = new Map<string, WeatherForecast>();
  for (const call of [...activity, ...delegated.flatMap((work) => work.activity)]) {
    if (call.outcome !== "succeeded" || !call.weatherForecast) continue;
    const forecast = call.weatherForecast;
    forecasts.set(JSON.stringify([forecast.place, forecast.date]), forecast);
  }
  if (!forecasts.size) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {[...forecasts].map(([key, forecast]) => (
        <ForecastCard key={key} forecast={forecast} onOpenExternal={onOpenExternal} />
      ))}
    </div>
  );
}

const source = "https://open-meteo.com/";

function ForecastCard({
  forecast,
  onOpenExternal,
}: {
  forecast: WeatherForecast;
  onOpenExternal: ((url: string) => void) | undefined;
}) {
  const t = useTranslations("agents");
  const locale = useLocale();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${forecast.date}T00:00:00Z`),
  );
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(locale, { style: "percent" });
  const weather = condition(forecast.code);
  function temperature(value: number | null) {
    return value === null ? "—" : `${number.format(value)} °C`;
  }
  function probability(value: number | null) {
    return value === null ? "—" : percent.format(value / 100);
  }
  return (
    <article
      aria-label={t("weather.card", { place: forecast.place })}
      className="flex w-full min-w-0 max-w-lg flex-col gap-3 rounded-xl border bg-surface-panel p-3 sm:p-4"
    >
      <header className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
          <WeatherIcon weather={weather} />
        </span>
        <div className="min-w-0">
          <h3 className="font-medium wrap-anywhere">{forecast.place}</h3>
          <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
            <time dateTime={forecast.date}>{date}</time>
            <span aria-hidden="true">·</span>
            <span>{t(`weather.conditions.${weather}`)}</span>
          </p>
        </div>
      </header>
      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-background p-2.5 sm:p-3">
        <div>
          <dt className="text-xs text-muted-foreground">{t("weather.high")}</dt>
          <dd className="font-medium tabular-nums">{temperature(forecast.high)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("weather.low")}</dt>
          <dd className="font-medium tabular-nums">{temperature(forecast.low)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("weather.maxRain")}</dt>
          <dd className="font-medium tabular-nums">{probability(forecast.rain)}</dd>
        </div>
      </dl>
      {forecast.hourly.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger render={<Button variant="ghost" className="min-h-11" size="sm" />}>
            <ChevronDownIcon
              data-icon="inline-start"
              aria-hidden="true"
              className="group-aria-[expanded=false]/button:-rotate-90"
            />
            {t("weather.hourly")}
          </CollapsibleTrigger>
          <CollapsibleContent className="max-h-64 overflow-y-auto overscroll-contain">
            <Table aria-label={t("weather.hourly")}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t("weather.localTime")}</TableHead>
                  <TableHead scope="col">{t("weather.condition")}</TableHead>
                  <TableHead scope="col">{t("weather.temperature")}</TableHead>
                  <TableHead scope="col">{t("weather.rain")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecast.hourly.map((hour, index) => (
                  <TableRow key={`${hour.time}:${index}`}>
                    <TableCell>
                      <time dateTime={`${forecast.date}T${hour.time}`}>{hour.time}</time>
                    </TableCell>
                    <TableCell>{t(`weather.conditions.${condition(hour.code)}`)}</TableCell>
                    <TableCell>{temperature(hour.temperature)}</TableCell>
                    <TableCell>{probability(hour.rain)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CollapsibleContent>
        </Collapsible>
      )}
      <a
        href={source}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1 rounded-sm text-xs text-muted-foreground hover:underline focus-visible:focus-control"
        onClick={(event) => {
          if (!onOpenExternal) return;
          event.preventDefault();
          onOpenExternal(source);
        }}
      >
        {t("weather.source")} <ArrowUpRightIcon aria-hidden="true" className="size-3" />
      </a>
    </article>
  );
}
