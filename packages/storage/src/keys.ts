import { StorageError } from "./errors.js";

const SEGMENT = /^[A-Za-z0-9!_.*'()-]+$/;

/** Rejects keys that could escape a prefix or differ between drivers. */
export function assertObjectKey(key: string): string {
  const segments = key.split("/");
  if (
    key.length === 0 ||
    key.length > 1024 ||
    segments.some((segment) => !SEGMENT.test(segment) || segment === "." || segment === "..")
  )
    throw new StorageError("INVALID_OBJECT_KEY");
  return key;
}

export function assertObjectPrefix(prefix: string | undefined): string {
  if (!prefix) return "";
  return assertObjectKey(prefix.replace(/\/$/, ""));
}

/** unstorage separates key segments with `:`; validated keys never contain one. */
export const fromStorageKey = (key: string) => key.replaceAll(":", "/");
