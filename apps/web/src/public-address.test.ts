import { expect, it } from "vitest";
import { resolveWebOrigins, validateWebEnvironment } from "./public-address.js";

it.each(["https://first.example.test", "https://second.example.test"])(
  "resolves shared transport and absolute links from the request at %s",
  (origin) => {
    expect(resolveWebOrigins(origin, { NODE_ENV: "production" })).toEqual({
      apiBaseUrl: "",
      apiOrigin: origin,
      webOrigin: origin,
    });
  },
);
it("takes the split API address from the Web process at request time", () => {
  expect(
    resolveWebOrigins("https://web.example.test", {
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.example.test",
    }),
  ).toEqual({
    apiBaseUrl: "https://api.example.test",
    apiOrigin: "https://api.example.test",
    webOrigin: "https://web.example.test",
  });
});
it("preserves separate local dev ports without configuration", () => {
  expect(resolveWebOrigins("http://localhost:3000", {})).toEqual({
    apiBaseUrl: "http://localhost:3002",
    apiOrigin: "http://localhost:3002",
    webOrigin: "http://localhost:3000",
  });
});
it("keeps same-origin transport relative when the runtime API setting equals the Web origin", () => {
  expect(
    resolveWebOrigins("https://web.example.test", {
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://WEB.example.test:443",
    }).apiBaseUrl,
  ).toBe("");
});
it.each(["", "https://old.example.test"])("rejects retired Web input even when empty", (value) => {
  expect(() => validateWebEnvironment({ VITE_API_URL: value })).toThrow(
    /VITE_API_URL.*API_PUBLIC_URL/,
  );
});
it.each([
  "https://api.example.test/",
  "http://api.example.test",
  "https://u:p@api.example.test",
  "https://*.example.test",
])("rejects invalid production runtime API configuration", (value) => {
  expect(() => validateWebEnvironment({ NODE_ENV: "production", API_PUBLIC_URL: value })).toThrow(
    "API_PUBLIC_URL",
  );
});

it("permits prepared split-port acceptance only over loopback HTTP", () => {
  expect(
    resolveWebOrigins("http://127.0.0.1:4173", {
      NODE_ENV: "production",
      API_PUBLIC_URL: "http://127.0.0.1:56539",
    }).apiOrigin,
  ).toBe("http://127.0.0.1:56539");
});
