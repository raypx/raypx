import { z } from "zod";
import { createApiClient } from "@voidmix/client";
import { getDesktopLocaleHeaders } from "../../i18n/client";
import type { CloudSnapshot } from "./types";

export type RemoteSnapshotResult =
  | { kind: "loaded"; snapshot: CloudSnapshot }
  | { kind: "invalid_snapshot" }
  | { kind: "overview_unavailable" }
  | { kind: "health_check_failed" };

const name = z.string().min(1);
const nonnegative = z.number().nonnegative();
const count = nonnegative.int();
const detailSchema = z
  .object({
    kind: z.enum(["files", "objects"]),
    count,
    sizeBytes: nonnegative.optional(),
  })
  .transform(({ sizeBytes, ...detail }) => ({
    ...detail,
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
  }));
const jobSchema = z.object({
  id: name,
  name,
  kind: z.enum(["upload", "download", "index"]),
  status: z.enum(["active", "queued", "complete"]),
  progress: nonnegative.max(100),
  detail: z.preprocess(normalizeDetail, detailSchema),
});
const storageSchema = z
  .object({
    used: nonnegative,
    total: nonnegative.positive(),
    projects: nonnegative,
    media: nonnegative,
    archives: nonnegative,
  })
  .refine(({ used, total }) => used <= total);

export async function fetchRemoteSnapshot(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<RemoteSnapshotResult> {
  const baseUrl = apiUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const timer = globalThis.setTimeout(() => controller.abort(), 3500);

  try {
    let client: ReturnType<typeof createApiClient>;
    try {
      client = createApiClient({ baseUrl, headers: getDesktopLocaleHeaders });
    } catch {
      return { kind: "health_check_failed" };
    }

    try {
      await client.health({}, { signal: requestSignal });
    } catch {
      signal?.throwIfAborted();
      return { kind: "health_check_failed" };
    }

    try {
      const response = await fetch(`${baseUrl}/desktop/overview`, {
        headers: { ...getDesktopLocaleHeaders(), accept: "application/json" },
        signal: requestSignal,
      });
      if (!response.ok) {
        signal?.throwIfAborted();
        return { kind: "overview_unavailable" };
      }
      const data: unknown = await response.json();
      const snapshot = normalizeSnapshot(data);
      if (!snapshot) return { kind: "invalid_snapshot" };
      return { kind: "loaded", snapshot };
    } catch {
      signal?.throwIfAborted();
      return { kind: "overview_unavailable" };
    }
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export function normalizeSnapshot(value: unknown, now = new Date()): CloudSnapshot | null {
  const parseDate = (candidate: unknown): Date | null => {
    if (candidate instanceof Date) return Number.isFinite(candidate.valueOf()) ? candidate : null;
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) return null;
      // Older payloads occasionally used Unix seconds while JSON APIs usually
      // send milliseconds. Distinguish them by their practical magnitude.
      const timestamp = Math.abs(candidate) < 1e12 ? candidate * 1000 : candidate;
      const date = new Date(timestamp);
      return Number.isFinite(date.valueOf()) ? date : null;
    }
    if (typeof candidate !== "string") return null;
    const value = candidate.trim();
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isFinite(parsed.valueOf())) return parsed;
    return parseRelativeDate(value, now);
  };
  const date = z.unknown().transform(parseDate).pipe(z.date());
  const device = z
    .object({
      id: name,
      name,
      platform: name,
      kind: z.enum(["desktop", "laptop", "phone"]),
      online: z.boolean(),
      lastSeen: date,
      syncedBytes: nonnegative.optional(),
      synced: z.unknown().optional(),
    })
    .transform(({ syncedBytes, synced, ...device }) => ({
      ...device,
      syncedBytes: syncedBytes ?? parseHumanSize(synced),
    }))
    .pipe(
      z.object({
        id: name,
        name,
        platform: name,
        kind: z.enum(["desktop", "laptop", "phone"]),
        online: z.boolean(),
        lastSeen: z.date(),
        syncedBytes: nonnegative,
      }),
    );
  const result = z
    .object({
      lastChecked: date,
      lastBackup: date,
      pendingItems: count,
      fileCount: count,
      newThisWeek: count,
      storage: storageSchema,
      jobs: z.array(jobSchema),
      devices: z.array(device),
    })
    .safeParse(value);
  return result.success ? result.data : null;
}

function parseRelativeDate(value: string, now: Date): Date | null {
  const normalized = value.toLowerCase().replace(/\s+/gu, " ").trim();
  if (/^(?:now|just now|right now|today|刚刚|现在|今天)$/u.test(normalized)) {
    return new Date(now);
  }
  if (/^(?:yesterday|昨天)$/u.test(normalized)) {
    return new Date(now.valueOf() - 24 * 60 * 60 * 1000);
  }

  const relative = normalized.match(
    /^(\d+(?:\.\d+)?)\s*(minutes?|mins?|min|m|hours?|hrs?|hr|h|分钟|小时|时)\s*(?:ago|前)?$/u,
  );
  if (!relative) return null;
  const amount = Number(relative[1]);
  const unit = relative[2];
  if (!Number.isFinite(amount) || !unit) return null;
  const milliseconds = /^(?:hours?|hrs?|hr|h|小时|时)$/u.test(unit)
    ? amount * 60 * 60 * 1000
    : amount * 60 * 1000;
  const date = new Date(now.valueOf() - milliseconds);
  return Number.isFinite(date.valueOf()) ? date : null;
}

const sizeUnits = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 } as const;

function parseHumanSize(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2]?.toUpperCase() as keyof typeof sizeUnits | undefined;
  if (!Number.isFinite(amount) || !unit) return null;
  const bytes = amount * sizeUnits[unit];
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
}

function normalizeDetail(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.replace(/\s+/gu, " ").trim();
  const sizePattern = String.raw`(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)`;
  const patterns = {
    files: String.raw`^(\d+)\s*(?:files?|个文件)(?:\s*[·•]\s*${sizePattern})?$`,
    objects: String.raw`^(?:(?:indexed|已索引)\s*)?(\d+)\s*(?:objects?|个(?:变更)?对象)(?:\s*(?:indexed|已索引|已编入索引))?(?:\s*[·•]\s*${sizePattern})?$`,
  };
  for (const [kind, pattern] of Object.entries(patterns)) {
    const match = normalized.match(new RegExp(pattern, "iu"));
    if (match)
      return {
        kind,
        count: Number(match[1]),
        ...(match[2] && match[3] ? { sizeBytes: parseHumanSize(`${match[2]} ${match[3]}`) } : {}),
      };
  }
  return null;
}
