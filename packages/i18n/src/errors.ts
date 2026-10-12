import type { TranslationValues } from "./types.js";
import type { Translator } from "./translator.js";

export type ErrorCodeMap = Readonly<Record<string, string>>;

export type LocalizedErrorDetails = {
  code: string;
  values?: TranslationValues;
};

const unsafeValueKeys = new Set(["__proto__", "constructor", "prototype"]);

function readOwnProperty(record: Record<string, unknown>, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  return record[key];
}

function isSafeTranslationValue(value: unknown): value is TranslationValues[string] {
  if (typeof value === "string" || typeof value === "boolean" || value === null) return true;
  if (typeof value === "number") return Number.isFinite(value);
  return value instanceof Date && Number.isFinite(value.valueOf());
}

export function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  try {
    const code = readOwnProperty(error as Record<string, unknown>, "code");
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

export function readErrorDetails(error: unknown): LocalizedErrorDetails | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  try {
    const record = error as Record<string, unknown>;
    const directCode = readOwnProperty(record, "code");
    const data = readOwnProperty(record, "data");
    const dataRecord =
      typeof data === "object" && data !== null ? (data as Record<string, unknown>) : undefined;
    const nested = dataRecord ? readOwnProperty(dataRecord, "error") : undefined;
    const source =
      typeof nested === "object" && nested !== null ? (nested as Record<string, unknown>) : record;
    const sourceCode = readOwnProperty(source, "code");
    const code =
      typeof sourceCode === "string"
        ? sourceCode
        : typeof directCode === "string"
          ? directCode
          : undefined;
    if (!code) return undefined;
    const values = readOwnProperty(source, "values");
    if (!values || typeof values !== "object" || Array.isArray(values)) return { code };
    const safeValues: TranslationValues = {};
    for (const [key, value] of Object.entries(values)) {
      if (unsafeValueKeys.has(key) || !isSafeTranslationValue(value)) continue;
      Object.defineProperty(safeValues, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
    }
    return Object.keys(safeValues).length > 0 ? { code, values: safeValues } : { code };
  } catch {
    // Error-like values may be proxies or objects with throwing accessors.
    return undefined;
  }
}

export function translateErrorCode(
  error: unknown,
  translator: Translator,
  errorKeys: ErrorCodeMap,
  fallbackKey = "unknown",
): string {
  const details = readErrorDetails(error);
  const code = details?.code;
  const key =
    code && Object.prototype.hasOwnProperty.call(errorKeys, code)
      ? (errorKeys[code] ?? fallbackKey)
      : fallbackKey;
  return translator(key, details?.values);
}

export function translateKnownErrorCode(
  error: unknown,
  translator: Translator,
  errorKeys: ErrorCodeMap,
): string | null {
  const details = readErrorDetails(error);
  const code = details?.code;
  if (!code || !Object.prototype.hasOwnProperty.call(errorKeys, code)) return null;
  const key = errorKeys[code];
  return key ? translator(key, details?.values) : null;
}
