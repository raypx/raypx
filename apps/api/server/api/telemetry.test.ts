import { describe, expect, it } from "vite-plus/test";
import { allowlistedErrorEvent, createErrorReporter } from "./telemetry.js";

describe("API telemetry privacy", () => {
  it("leaves business work available when telemetry is disabled", async () => {
    const reporter = createErrorReporter({ environment: "test" });
    await expect(reporter.trace("cloud.runs.snapshot", async () => 42)).resolves.toBe(42);
    await reporter.close();
  });
  it("drops error content, headers, document data and signed URLs", () => {
    const event = allowlistedErrorEvent({
      type: undefined,
      event_id: "event",
      message: "private prompt",
      request: {
        url: "https://objects.test/file?token=secret",
        headers: { authorization: "Bearer secret" },
      },
      extra: { document: "confidential" },
      user: { email: "private@example.test" },
      breadcrumbs: [{ message: "private file" }],
      exception: {
        values: [
          {
            type: "Error",
            value: "private prompt",
            stacktrace: { frames: [{ vars: { token: "secret" } }] },
          },
        ],
      },
    });
    const serialized = JSON.stringify(event);
    for (const privateValue of [
      "private",
      "secret",
      "confidential",
      "authorization",
      "example.test",
    ])
      expect(serialized).not.toContain(privateValue);
    expect(event.exception?.values?.[0]?.type).toBe("Error");
  });
});
