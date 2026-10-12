import { describe, expect, it } from "vite-plus/test";
import { allowedProductProperties, routeCategory, allowedBrowserFrame } from "./product-telemetry";

describe("product telemetry allowlist", () => {
  it("drops user content, credentials and identifiers even from structurally widened input", () => {
    const input = {
      mode: "computer" as const,
      artifactCount: 2,
      prompt: "secret",
      token: "key",
      signedUrl: "https://private/file?secret=1",
      accountId: "user",
    };
    expect(allowedProductProperties(input)).toEqual({ mode: "computer", artifactCount: 2 });
  });
  it("rejects invalid metric values and strips resource paths", () => {
    expect(allowedProductProperties({ artifactCount: Number.NaN })).toEqual({});
    expect(routeCategory("/chat/confidential-id?prompt=private")).toBe("chat");
  });
});

it("retains only static build error locations and strips signed query/context fields", () => {
  expect(
    allowedBrowserFrame(
      { filename: "https://app.example/assets/chat-Abc.js?secret=1", lineno: 42, colno: 9 },
      "https://app.example",
    ),
  ).toEqual({ filename: "/assets/chat-Abc.js", lineno: 42, colno: 9 });
  expect(
    allowedBrowserFrame(
      { filename: "https://files.example/private/report?signature=token" },
      "https://app.example",
    ),
  ).toBeNull();
  expect(
    allowedBrowserFrame(
      { filename: "https://app.example/chat/private-account" },
      "https://app.example",
    ),
  ).toBeNull();
});
