import { afterEach, expect, it, vi } from "vite-plus/test";
import { uuid, task, activity, fixture } from "../../../helpers/agent-snapshot.js";

afterEach(() => vi.restoreAllMocks());

it("bounds decoded activity among 10,000 historical entries while retaining old active work", () => {
  const f = fixture();
  try {
    f.store.put(task(1));
    f.database.transaction(() => {
      for (let index = 0; index < 10_000; index++) {
        const entry = activity(
          index,
          uuid(1),
          `Activity ${index}`,
          index === 0 ? "streaming" : "complete",
        );
        f.activity.run(entry.id, "relay", entry.taskId, JSON.stringify(entry));
        const other = activity(10_000 + index, uuid(1), "Other binding");
        f.activity.run(other.id, "other-binding", other.taskId, JSON.stringify(other));
      }
    })();
    const parse = vi.spyOn(JSON, "parse");
    const started = performance.now();
    const snapshot = f.store.snapshot("relay");
    const elapsedMs = performance.now() - started;
    const decodedRows = parse.mock.calls.length;
    parse.mockRestore();
    const entries = snapshot.records.flatMap((record) =>
      record.kind === "activity" ? [record.entry] : [],
    );
    expect(entries.map((entry) => entry.id)).toEqual([
      activity(0, uuid(1)).id,
      ...Array.from({ length: 64 }, (_, index) => activity(9_999 - index, uuid(1)).id),
    ]);
    expect(snapshot.records[0]).toMatchObject({ kind: "task", task: { activityIncomplete: true } });
    expect(decodedRows).toBe(66);
    console.info(
      JSON.stringify({
        benchmark: "agent-snapshot-activity",
        activityRows: 10_000,
        otherBindingRows: 10_000,
        decodedRows,
        elapsedMs,
      }),
    );
  } finally {
    f.close();
  }
});

it("admits activity in fair rounds before decoding and stays within the 32 MiB checkpoint budget", () => {
  const f = fixture();
  try {
    f.database.transaction(() => {
      for (let index = 0; index < 100; index++) {
        const local = task(index + 1);
        f.put.run(local.task.id, JSON.stringify(local));
        for (let entry = 0; entry < 16; entry++) {
          const value = activity(
            index * 16 + entry,
            local.task.id,
            "x".repeat(32_000),
            "streaming",
          );
          f.activity.run(value.id, "relay", local.task.id, JSON.stringify(value));
        }
      }
    })();
    const parse = vi.spyOn(JSON, "parse");
    const snapshot = f.store.snapshot("relay");
    const entries = snapshot.records.filter((record) => record.kind === "activity");
    expect(parse).toHaveBeenCalledTimes(100 + entries.length);
    expect(entries.length).toBeGreaterThan(100);
    expect(entries.length).toBeLessThan(1600);
    expect(new Set(entries.slice(0, 100).map((record) => record.entry.taskId)).size).toBe(100);
    const counts = new Map<string, number>();
    for (const record of entries)
      counts.set(record.entry.taskId, (counts.get(record.entry.taskId) ?? 0) + 1);
    expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
    expect(Buffer.byteLength(JSON.stringify(snapshot.records))).toBeLessThan(
      32 * 1024 * 1024 - 64 * 1024,
    );
    expect(
      snapshot.records
        .filter((record) => record.kind === "task")
        .every((record) => record.task.activityIncomplete),
    ).toBe(true);
  } finally {
    f.close();
  }
});

it("keeps old active entries plus a bounded recent page, deduplicates them and marks omitted history", () => {
  const f = fixture();
  try {
    f.store.put(task(1));
    f.store.put(task(2));
    f.store.put(task(3));
    f.database.transaction(() => {
      for (let index = 0; index < 80; index++) {
        const value = activity(
          index,
          uuid(1),
          "界".repeat(32_000),
          index === 0 ? "streaming" : "complete",
        );
        f.activity.run(value.id, "relay", uuid(1), JSON.stringify(value));
      }
      const value = activity(100, uuid(2), "done", "streaming");
      f.activity.run(value.id, "relay", uuid(2), JSON.stringify(value));
    })();
    const parse = vi.spyOn(JSON, "parse");
    const snapshot = f.store.snapshot("relay");
    const entries = snapshot.records.filter((record) => record.kind === "activity");
    expect(entries.map((record) => record.entry.id)).toEqual([
      uuid(1_000_000),
      uuid(1_000_100),
      uuid(1_000_079),
      uuid(1_000_078),
    ]);
    expect(parse).toHaveBeenCalledTimes(7);
    expect(
      snapshot.records
        .filter((record) => record.kind === "task")
        .map((record) => record.task.activityIncomplete),
    ).toEqual([true, false, false]);
  } finally {
    f.close();
  }
});
