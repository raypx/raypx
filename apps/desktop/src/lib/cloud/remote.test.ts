import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { fetchRemoteSnapshot, normalizeSnapshot } from "./remote";
import { demoCloudSnapshot } from "./demo";

function snapshotInput(overrides: Record<string, unknown> = {}) {
  return {
    lastChecked: "2026-09-09T00:00:00.000Z",
    lastBackup: "2026-09-09T00:00:00.000Z",
    pendingItems: 0,
    fileCount: 0,
    newThisWeek: 0,
    storage: { used: 0, total: 1, projects: 0, media: 0, archives: 0 },
    jobs: [],
    devices: [],
    ...overrides,
  };
}

function mockSnapshotFetch(snapshot: Record<string, unknown>) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const pathname = new URL(input instanceof Request ? input.url : input).pathname;
    return Response.json(
      pathname === "/rpc/health"
        ? { status: "ok", timestamp: "2026-09-09T00:00:00.000Z" }
        : snapshot,
    );
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("remote cloud snapshot adapter", () => {
  it("cancels the in-flight request when its route is left", async () => {
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      return new Promise<Response>((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason), {
          once: true,
        });
      });
    });
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const reason = new Error("Route left");
    const result = fetchRemoteSnapshot("https://api.example.test", controller.signal);
    const rejected = expect(result).rejects.toBe(reason);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    controller.abort(reason);
    await rejected;
  });

  it("accepts the deterministic preview shape without losing canonical values", () => {
    const snapshot = normalizeSnapshot(demoCloudSnapshot);
    expect(snapshot).toMatchObject({
      lastChecked: demoCloudSnapshot.lastChecked,
      lastBackup: demoCloudSnapshot.lastBackup,
      storage: demoCloudSnapshot.storage,
      devices: demoCloudSnapshot.devices,
    });
    expect(snapshot?.jobs).toHaveLength(demoCloudSnapshot.jobs.length);
  });

  it("rejects incomplete API responses", () => {
    expect(normalizeSnapshot({ fileCount: 1, pendingItems: 0, jobs: [], devices: [] })).toBeNull();
    expect(normalizeSnapshot(null)).toBeNull();
  });

  it.each([
    ["lastChecked", new Date(NaN)],
    ["lastBackup", "invalid-date"],
    ["pendingItems", -1],
    ["fileCount", 0.5],
    ["newThisWeek", Number.MAX_SAFE_INTEGER + 1],
    ["storage.total", 0],
    ["storage.used", Infinity],
    ["storage.projects", -1],
    ["storage.media", NaN],
    ["storage.archives", "1"],
    ["jobs.0.id", ""],
    ["jobs.0.name", ""],
    ["jobs.0.kind", "unknown"],
    ["jobs.0.status", "unknown"],
    ["jobs.0.progress", 101],
    ["jobs.0.progress", -1],
    ["jobs.0.detail.kind", "unknown"],
    ["jobs.0.detail.count", -1],
    ["jobs.0.detail.sizeBytes", -1],
    ["devices.0.id", ""],
    ["devices.0.name", ""],
    ["devices.0.platform", ""],
    ["devices.0.kind", "unknown"],
    ["devices.0.online", "true"],
    ["devices.0.lastSeen", new Date(NaN)],
    ["devices.0.syncedBytes", -1],
  ] as const)("rejects malformed %s at the normalization boundary", (path, value) => {
    const snapshot = structuredClone(demoCloudSnapshot);
    const keys = path.split(".");
    const field = keys.pop()!;
    let target = snapshot as unknown as Record<string, unknown>;
    for (const key of keys) target = target[key] as Record<string, unknown>;
    target[field] = value;
    expect(normalizeSnapshot(snapshot)).toBeNull();
  });

  it("normalizes legacy display strings into locale-neutral data", async () => {
    const fetch = mockSnapshotFetch(
      snapshotInput({
        lastBackup: "2026-09-08T23:52:00.000Z",
        pendingItems: 2,
        fileCount: 128,
        newThisWeek: 12,
        storage: {
          used: 2 * 1024 ** 3,
          total: 4 * 1024 ** 3,
          projects: 1,
          media: 1,
          archives: 0,
        },
        jobs: [
          jobInput({
            name: "Campaign exports",
            detail: "18 files · 1.8 GB",
            kind: "upload",
            status: "active",
            progress: 72,
          }),
          jobInput({ id: "job-2", name: "Design system", detail: "328 objects indexed" }),
        ],
        devices: [deviceInput({ lastSeen: "2026-09-09T00:00:00.000Z", synced: "48.2 GB" })],
      }),
    );

    const result = await fetchRemoteSnapshot("https://api.example.test/");

    expect(result.kind).toBe("loaded");
    if (result.kind !== "loaded") return;
    expect(result.snapshot.lastChecked).toEqual(new Date("2026-09-09T00:00:00.000Z"));
    expect(result.snapshot.jobs[0]?.detail).toEqual({
      kind: "files",
      count: 18,
      sizeBytes: 1.8 * 1024 ** 3,
    });
    expect(result.snapshot.jobs[1]?.detail).toEqual({ kind: "objects", count: 328 });
    expect(result.snapshot.devices[0]?.syncedBytes).toBeCloseTo(48.2 * 1024 ** 3);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects non-finite and semantically invalid snapshot values", async () => {
    mockSnapshotFetch(
      snapshotInput({
        lastBackup: "2026-09-08T23:52:00.000Z",
        fileCount: 1,
        storage: { used: 3, total: 2, projects: 1, media: 1, archives: 1 },
      }),
    );

    await expect(fetchRemoteSnapshot("https://api.example.test")).resolves.toEqual({
      kind: "invalid_snapshot",
    });
  });

  it("normalizes localized legacy dates and detail strings", () => {
    const now = new Date("2026-09-09T12:00:00.000Z");
    const snapshot = normalizeSnapshot(
      {
        ...snapshotInput(),
        lastChecked: "刚刚",
        lastBackup: "2 hr ago",

        jobs: [
          jobInput({ name: "索引", detail: "328 个对象已索引 · 0 B" }),
          jobInput({
            id: "job-2",
            name: "上传",
            detail: "18 个文件 · 1.8 GB",
            kind: "upload",
            status: "active",
            progress: 50,
          }),
        ],
        devices: [deviceInput({ lastSeen: "8 分钟前", syncedBytes: 0 })],
      },
      now,
    );

    expect(snapshot).not.toBeNull();
    expect(snapshot?.lastChecked).toEqual(now);
    expect(snapshot?.lastBackup).toEqual(new Date("2026-09-09T10:00:00.000Z"));
    expect(snapshot?.jobs[0]?.detail).toEqual({
      kind: "objects",
      count: 328,
      sizeBytes: 0,
    });
    expect(snapshot?.jobs[1]?.detail).toEqual({
      kind: "files",
      count: 18,
      sizeBytes: 1.8 * 1024 ** 3,
    });
    expect(snapshot?.devices[0]?.lastSeen).toEqual(new Date("2026-09-09T11:52:00.000Z"));
  });

  it("accepts structured object details with a zero byte size", () => {
    const snapshot = normalizeSnapshot({
      ...snapshotInput(),
      jobs: [jobInput({ detail: { kind: "objects", count: 0, sizeBytes: 0 } })],
      devices: [],
    });

    expect(snapshot?.jobs[0]?.detail).toEqual({
      kind: "objects",
      count: 0,
      sizeBytes: 0,
    });
  });

  it("parses protocol relative dates independently of the host locale", () => {
    vi.spyOn(String.prototype, "toLocaleLowerCase").mockReturnValue("2 mınutes ago");

    const now = new Date("2026-09-09T12:00:00.000Z");
    const snapshot = normalizeSnapshot(
      {
        ...snapshotInput(),
        lastChecked: "2 MINUTES AGO",
        lastBackup: "2026-09-09T00:00:00.000Z",
      },
      now,
    );

    expect(snapshot?.lastChecked).toEqual(new Date("2026-09-09T11:58:00.000Z"));
  });

  it("rejects an invalid canonical device size instead of falling back to legacy text", () => {
    const snapshot = normalizeSnapshot({
      ...snapshotInput(),
      jobs: [],
      devices: [
        deviceInput({ lastSeen: "2026-09-09T00:00:00.000Z", syncedBytes: -1, synced: "5 GB" }),
      ],
    });

    expect(snapshot).toBeNull();
  });
});

function jobInput(fields: Record<string, unknown>) {
  return {
    id: "job-1",
    name: "Index",
    kind: "index",
    status: "complete",
    progress: 100,
    ...fields,
  };
}
function deviceInput(fields: Record<string, unknown>) {
  return {
    id: "device-1",
    name: "Mac Studio",
    platform: "macOS",
    kind: "desktop",
    online: true,
    ...fields,
  };
}
