import type { ZodType } from "zod";
import { normalizeTaskJson } from "@raypx/core/task-text";
import { LocalError } from "../errors";

/** Persisted JSON crosses the same validation boundary on every read. */
export function storedRecord<T>(schema: ZodType<T>, value: string): T {
  try {
    return schema.parse(normalizeTaskJson(JSON.parse(value)));
  } catch {
    throw new LocalError("INVALID_STORED_DATA", "Profile contains invalid stored data");
  }
}
