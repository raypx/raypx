import { describe, expect, it } from "vite-plus/test";
import { hydrateCloudRecord } from "./repositories/cloud/records.js";

const time = new Date("2026-10-13T00:00:00.000Z");
const persisted = <T>(value: T): T => hydrateCloudRecord<T>(JSON.parse(JSON.stringify(value)));

describe("Cloud JSON records", () => {
  it("restores entity dates and nullable leases without altering tool JSON", () => {
    const record = {
      createdAt: time,
      updatedAt: time,
      startedAt: time,
      completedAt: null,
      heartbeatAt: time,
      leaseExpiresAt: time,
      input: { createdAt: "yesterday", expiresAt: time.toISOString() },
      output: { rows: [{ updatedAt: "source text" }] },
    };
    expect(persisted(record)).toEqual(record);
  });

  it("restores replayed upload and Task DTO dates while preserving their nested content", () => {
    const upload = {
      createdAt: time,
      updatedAt: time,
      expiresAt: time,
      verifiedAt: time,
      properties: { updatedAt: "unchanged" },
    };
    const result = {
      task: { createdAt: time, updatedAt: time },
      round: { createdAt: time, updatedAt: time },
      run: { createdAt: time, updatedAt: time, leaseExpiresAt: time, completedAt: null },
      turn: { createdAt: time, updatedAt: time },
    };
    for (const response of [upload, result]) {
      const mutation = { createdAt: time, updatedAt: time, response };
      expect(persisted(mutation)).toEqual(mutation);
    }
  });

  it("restores event dates while keeping date-like event payloads as JSON", () => {
    const event = {
      occurredAt: time,
      payload: {
        createdAt: "input text",
        completedAt: time.toISOString(),
        response: { expiresAt: "tomorrow" },
      },
    };
    expect(persisted(event)).toEqual(event);
  });
});
