import { z } from "zod";
import { weatherForecastSchema } from "@raypx/core/conversation";
import { WEATHER_API_URL } from "@raypx/core/openapi-servers";
import type { OpenApiToolOperation } from "./document.js";

const path = "/v1/forecast";
const monthDay = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const weatherInput = z.strictObject({
  city: z.string().trim().min(2).max(120),
  date: z
    .union([
      z.iso.date(),
      z.string().regex(monthDay),
      z.enum(["today", "tomorrow", "day_after_tomorrow"]),
    ])
    .default("today"),
  countryCode: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
  language: z.enum(["en", "zh"]).optional(),
});
export const weatherDefinition = {
  name: "weather_forecast" as const,
  description:
    "Get an Open-Meteo forecast for a city on one local date in the next 16 days. Use today, tomorrow, day_after_tomorrow, YYYY-MM-DD, or MM-DD when the user gives no year. For ambiguous cities ask the user to choose a country or region. Pass a country code when known and language en or zh for place names.",
  parameters: z.toJSONSchema(weatherInput),
};
export function openMeteoOperations(): OpenApiToolOperation[] {
  return [
    {
      operationId: weatherDefinition.name,
      label: "Weather forecast",
      method: "GET",
      path,
      readOnly: true,
      preset: "open-meteo",
      parameters: [],
      bodySchema: null,
      bodyRequired: false,
      inputSchema: weatherDefinition.parameters,
    },
  ];
}
export function isWeatherOperation(url: string, operation: OpenApiToolOperation) {
  return (
    url === WEATHER_API_URL &&
    operation.preset === "open-meteo" &&
    operation.operationId === weatherDefinition.name &&
    operation.method === "GET" &&
    operation.path === path &&
    operation.readOnly
  );
}
export function weatherArguments(input: unknown) {
  const result = weatherInput.safeParse(input);
  return result.success ? result.data : undefined;
}

const citySchema = z.object({
  name: z.string().trim().min(1).max(120),
  admin1: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().min(1).max(80),
  population: z.number().nonnegative().optional(),
});
type City = z.infer<typeof citySchema>;
const citiesSchema = z.object({ results: z.array(z.unknown()).max(5).optional() });
const values = z.array(z.number().nullable()).max(25);
const forecastResponse = z.object({
  daily: z.object({
    time: z.array(z.iso.date()).length(1),
    weather_code: values,
    temperature_2m_min: values,
    temperature_2m_max: values,
    precipitation_probability_max: values,
  }),
  hourly: z.object({
    time: z.array(z.string()).max(25),
    weather_code: values,
    temperature_2m: values,
    precipitation_probability: values,
  }),
});
const dayMs = 86_400_000;

function cleanPlace(city: City) {
  return [...new Set([city.name, city.admin1, city.country].filter(Boolean))]
    .join(", ")
    .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ")
    .trim()
    .slice(0, 360);
}

function comparable(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").trim();
}

function localDate(timeZone: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);
}

export async function lookupWeather(
  input: NonNullable<ReturnType<typeof weatherArguments>>,
  key: string | undefined,
  read: (url: URL) => Promise<unknown>,
  now = new Date(),
) {
  const geocoder = key
    ? "https://customer-geocoding-api.open-meteo.com"
    : "https://geocoding-api.open-meteo.com";
  const search = new URL("/v1/search", geocoder);
  search.searchParams.set("name", input.city);
  search.searchParams.set("count", "5");
  search.searchParams.set(
    "language",
    input.language ?? (/\p{Script=Han}/u.test(input.city) ? "zh" : "en"),
  );
  if (input.countryCode) search.searchParams.set("countryCode", input.countryCode.toUpperCase());
  if (key) search.searchParams.set("apikey", key);
  const places = (citiesSchema.parse(await read(search)).results ?? []).flatMap((place) => {
    const parsed = citySchema.safeParse(place);
    return parsed.success ? [parsed.data] : [];
  });
  const city = places[0];
  if (!city) return { code: "CITY_NOT_FOUND" };
  const sameName = places.filter((other) => comparable(other.name) === comparable(city.name));
  const choices = [...new Set(sameName.map(cleanPlace))];
  const nextPopulation = sameName
    .slice(1)
    .reduce((max, other) => Math.max(max, other.population ?? 0), 0);
  const clearlyLarger = (city.population ?? 0) >= Math.max(100_000, nextPopulation * 5);
  if (choices.length > 1 && !clearlyLarger) return { code: "CITY_AMBIGUOUS", choices };

  const today = localDate(city.timezone, now);
  const through = addDays(today, 15);
  let date = input.date;
  if (date === "today") date = today;
  else if (date === "tomorrow") date = addDays(today, 1);
  else if (date === "day_after_tomorrow") date = addDays(today, 2);
  else if (monthDay.test(date)) {
    let year = Number(today.slice(0, 4));
    if (date < today.slice(5)) year++;
    date = `${year}-${date}`;
    if (!z.iso.date().safeParse(date).success) return { code: "INVALID_DATE" };
  }
  if (date < today || date > through) return { code: "DATE_OUT_OF_RANGE", from: today, through };

  const forecast = new URL(path, key ? "https://customer-api.open-meteo.com" : WEATHER_API_URL);
  forecast.search = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    timezone: city.timezone,
    start_date: date,
    end_date: date,
    daily: "weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max",
    hourly: "weather_code,temperature_2m,precipitation_probability",
    temperature_unit: "celsius",
    ...(key ? { apikey: key } : {}),
  }).toString();
  const { daily, hourly } = forecastResponse.parse(await read(forecast));
  if (daily.time[0] !== date) return { code: "FORECAST_UNAVAILABLE" };
  const hourlyRows = hourly.time.flatMap((time, index) => {
    if (!time.startsWith(`${date}T`)) return [];
    return [
      {
        time: time.slice(11),
        code: hourly.weather_code[index] ?? null,
        temperature: hourly.temperature_2m[index] ?? null,
        rain: hourly.precipitation_probability[index] ?? null,
      },
    ];
  });
  return {
    forecast: weatherForecastSchema.parse({
      place: cleanPlace(city),
      date,
      code: daily.weather_code[0] ?? null,
      low: daily.temperature_2m_min[0] ?? null,
      high: daily.temperature_2m_max[0] ?? null,
      rain: daily.precipitation_probability_max[0] ?? null,
      hourly: hourlyRows,
    }),
  };
}
