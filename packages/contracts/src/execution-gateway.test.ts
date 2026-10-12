import { describe, expect, it } from "vite-plus/test";
import {
  executionBootstrapSchema,
  executionOperations,
  executionOutputSchemas,
  executionObjectOutputSchemas,
  executionResearchOutputSchemas,
} from "./execution-gateway.js";

describe("private execution response contracts", () => {
  it("limits bootstrap to model identity and bounded history", () => {
    expect(executionBootstrapSchema.parse({ model: null, history: "" })).toEqual({
      model: null,
      history: "",
    });
    expect(
      executionBootstrapSchema.parse({
        model: { provider: "provider", id: "model" },
        history: "Previous conversation",
      }).model,
    ).toEqual({ provider: "provider", id: "model" });
    for (const response of [
      { history: "missing model" },
      { model: { provider: "provider" }, history: "" },
      { model: { provider: "provider", id: "model", apiKey: "secret" }, history: "" },
      { model: null, history: "x".repeat(20_001) },
      { model: null, history: "", credential: "secret" },
    ])
      expect(executionBootstrapSchema.safeParse(response).success).toBe(false);
  });

  it("defines a response schema for every execution operation", () => {
    expect(Object.keys(executionOutputSchemas).sort()).toEqual([...executionOperations].sort());
    for (const operation of executionOperations)
      expect(executionOutputSchemas[operation].safeParse(null).success).toBe(false);
  });

  it("preserves native event dates and opaque tool output while rejecting string dates", () => {
    const occurredAt = new Date("2026-10-12T00:00:00.000Z");
    const event = {
      runId: "run",
      sequence: 1,
      occurredAt,
      type: "tool.completed",
      executionId: "execution",
      eventId: "event",
      payload: { callId: "call", name: "search", output: { sdkValue: [1, null, "opaque"] } },
    };
    const parsed = executionOutputSchemas.appendEvent.parse(event);
    expect(parsed.occurredAt).toBe(occurredAt);
    expect(parsed.payload).toEqual(event.payload);
    expect(
      executionOutputSchemas.appendEvent.safeParse({
        ...event,
        occurredAt: occurredAt.toISOString(),
      }).success,
    ).toBe(false);
  });

  it("validates object metadata and nullable reads without accepting the wrong operation shape", () => {
    const metadata = {
      key: "object",
      byteSize: 5,
      contentType: "text/plain",
      checksumSha256: "a".repeat(64),
    };
    expect(executionObjectOutputSchemas.put.parse(metadata)).toEqual(metadata);
    expect(executionObjectOutputSchemas.head.parse(null)).toBeNull();
    expect(executionObjectOutputSchemas.read.parse(null)).toBeNull();
    expect(executionObjectOutputSchemas.read.parse({ metadata, bytes: "aGVsbG8=" })).toEqual({
      metadata,
      bytes: "aGVsbG8=",
    });
    expect(executionObjectOutputSchemas.put.safeParse(null).success).toBe(false);
    expect(executionObjectOutputSchemas.head.safeParse({ ...metadata, byteSize: -1 }).success).toBe(
      false,
    );
    expect(
      executionObjectOutputSchemas.head.safeParse({ ...metadata, checksumSha256: "bad" }).success,
    ).toBe(false);
    expect(executionObjectOutputSchemas.read.safeParse(metadata).success).toBe(false);
  });

  it("keeps research search/read responses distinct and validates source URLs", () => {
    const source = { url: "https://example.test/source", title: "Source", excerpt: "Evidence" };
    expect(executionResearchOutputSchemas.search.parse([source])).toEqual([source]);
    expect(
      executionResearchOutputSchemas.read.parse({
        url: source.url,
        title: source.title,
        text: "Full source",
      }).text,
    ).toBe("Full source");
    expect(executionResearchOutputSchemas.search.safeParse(source).success).toBe(false);
    expect(
      executionResearchOutputSchemas.search.safeParse([{ ...source, url: "invalid" }]).success,
    ).toBe(false);
    expect(executionResearchOutputSchemas.read.safeParse(source).success).toBe(false);
  });
});
