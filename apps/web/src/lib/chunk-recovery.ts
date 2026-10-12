const CHUNK_LOAD_ERROR_PATTERNS = [
  "failed to fetch dynamically imported module",
  "importing a module script failed",
  "error loading dynamically imported module",
] as const;

export const CHUNK_RECOVERY_STORAGE_KEY = "voidmix:chunk-recovery";

const CHUNK_RECOVERY_WINDOW_MS = 10_000;

interface ChunkRecoveryRecord {
  attemptedAt: number;
  url: string;
}

interface ShouldRetryChunkLoadOptions {
  now: number;
  previous: string | null;
  url: string;
}

export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : undefined;

  if (!message) {
    return false;
  }

  const normalizedMessage = message.toLowerCase();
  return CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => normalizedMessage.includes(pattern));
}

export function shouldRetryChunkLoad({ now, previous, url }: ShouldRetryChunkLoadOptions): boolean {
  if (previous === null) {
    return true;
  }

  const record = parseRecoveryRecord(previous);
  if (!record) {
    return false;
  }

  if (record.url !== url) {
    return true;
  }

  const elapsed = now - record.attemptedAt;
  return elapsed >= CHUNK_RECOVERY_WINDOW_MS;
}

export function createChunkRecoveryRecord(url: string, attemptedAt: number): string {
  return JSON.stringify({ attemptedAt, url } satisfies ChunkRecoveryRecord);
}

function parseRecoveryRecord(value: string): ChunkRecoveryRecord | null {
  try {
    const record = JSON.parse(value) as Partial<ChunkRecoveryRecord>;

    if (
      typeof record.attemptedAt !== "number" ||
      !Number.isFinite(record.attemptedAt) ||
      typeof record.url !== "string"
    ) {
      return null;
    }

    return {
      attemptedAt: record.attemptedAt,
      url: record.url,
    };
  } catch {
    return null;
  }
}
