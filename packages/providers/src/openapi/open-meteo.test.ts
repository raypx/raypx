import { expect, it, vi } from "vitest";
import { WEATHER_API_URL } from "@raypx/core/openapi-servers";
import { lookupWeather, openMeteoOperations, weatherArguments } from "./open-meteo.js";
import { createOpenApiTransport, type OpenApiTransportOptions } from "./transport.js";

const shanghai = {
  name: "上海",
  country: "中国",
  latitude: 31.23,
  longitude: 121.47,
  timezone: "Asia/Shanghai",
  population: 24_000_000,
};
const now = new Date("2026-08-09T17:30:00Z");

it("uses the city calendar for relative dates and keeps the paid key out of normalized values", async () => {
  const key = "fixture-forecast-key";
  const request = vi.fn<NonNullable<OpenApiTransportOptions["request"]>>(async ({ url }) => {
    let body: unknown;
    if (url.pathname === "/v1/search") {
      body = { results: [shanghai] };
    } else {
      body = {
        apiEcho: key,
        daily: {
          time: ["2026-08-11"],
          weather_code: [61],
          temperature_2m_min: [22],
          temperature_2m_max: [29],
          precipitation_probability_max: [80],
        },
        hourly: {
          time: ["2026-08-11T17:00"],
          temperature_2m: [28],
          weather_code: [61],
          precipitation_probability: [80],
        },
      };
    }
    return { status: 200, headers: new Headers(), body: JSON.stringify(body) };
  });
  const transport = createOpenApiTransport({
    request,
    now: () => now,
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
  });
  const result = await transport.call(
    WEATHER_API_URL,
    { authorization: `Bearer ${key}` },
    openMeteoOperations()[0]!,
    {
      city: "上海",
      date: "tomorrow",
    },
    new AbortController().signal,
  );
  expect(request).toHaveBeenCalledTimes(2);
  expect(
    request.mock.calls.map(([{ url }, method, headers]) => ({
      host: url.hostname,
      path: url.pathname,
      args: Object.fromEntries(url.searchParams),
      method,
      authorization: headers.authorization,
    })),
  ).toMatchObject([
    {
      host: "customer-geocoding-api.open-meteo.com",
      path: "/v1/search",
      args: { name: "上海", language: "zh", apikey: key },
      method: "GET",
      authorization: undefined,
    },
    {
      host: "customer-api.open-meteo.com",
      path: "/v1/forecast",
      args: {
        start_date: "2026-08-11",
        end_date: "2026-08-11",
        timezone: "Asia/Shanghai",
        apikey: key,
      },
      method: "GET",
      authorization: undefined,
    },
  ]);
  expect(result.isError).toBe(false);
  expect(result.content).not.toContain(key);
  expect(JSON.parse(result.content)).toEqual({
    forecast: {
      place: "上海, 中国",
      date: "2026-08-11",
      code: 61,
      low: 22,
      high: 29,
      rain: 80,
      hourly: [{ time: "17:00", code: 61, temperature: 28, rain: 80 }],
    },
  });
});

it("returns candidate cities and rejects dates outside the forecast range before requesting data", async () => {
  const read = vi.fn(async () => ({
    results: [
      {
        ...shanghai,
        name: "Springfield",
        admin1: "Illinois",
        country: "United States",
        population: 115_000,
      },
      {
        ...shanghai,
        name: "Springfield",
        admin1: "Massachusetts",
        country: "United States",
        population: 156_000,
      },
    ],
  }));
  await expect(
    lookupWeather(weatherArguments({ city: "Springfield", date: "today" })!, undefined, read, now),
  ).resolves.toEqual({
    code: "CITY_AMBIGUOUS",
    choices: ["Springfield, Illinois, United States", "Springfield, Massachusetts, United States"],
  });
  expect(read).toHaveBeenCalledTimes(1);
  read.mockClear();
  read.mockResolvedValue({ results: [{ ...shanghai, admin1: "上海" }] });
  await expect(
    lookupWeather(weatherArguments({ city: "上海", date: "2026-08-26" })!, undefined, read, now),
  ).resolves.toEqual({
    code: "DATE_OUT_OF_RANGE",
    from: "2026-08-10",
    through: "2026-08-25",
  });
  expect(read).toHaveBeenCalledTimes(1);
  expect(weatherArguments({ city: "上海", date: "2026-02-30" })).toBeUndefined();
});

it("resolves a month and day across the local New Year", async () => {
  const read = vi.fn(async (url: URL) => {
    if (url.pathname === "/v1/search") return { results: [shanghai] };
    return {
      daily: {
        time: ["2027-01-02"],
        weather_code: [0],
        temperature_2m_min: [-1],
        temperature_2m_max: [7],
        precipitation_probability_max: [0],
      },
      hourly: { time: [], weather_code: [], temperature_2m: [], precipitation_probability: [] },
    };
  });
  const result = await lookupWeather(
    weatherArguments({ city: "上海", date: "01-02" })!,
    undefined,
    read,
    new Date("2026-12-30T17:30:00Z"),
  );
  expect(read.mock.calls[1]?.[0].searchParams.get("start_date")).toBe("2027-01-02");
  expect(result).toMatchObject({ forecast: { date: "2027-01-02" } });
});
