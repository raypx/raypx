import { isLocale } from "./locale.js";
import type { IntlRuntimeOptions } from "./types.js";

type ErrorHandler = NonNullable<IntlRuntimeOptions["onError"]>;
type MessageFallback = NonNullable<IntlRuntimeOptions["getMessageFallback"]>;
type ErrorCode = Parameters<ErrorHandler>[0]["code"];

const reported = new Set<string>();
const reportLimit = 256;

function report(locale: string, code: ErrorCode, key?: string) {
  const diagnostic = {
    locale: isLocale(locale) ? locale : "unsupported",
    code,
    ...(key === undefined ? {} : { key }),
  };
  const identity = JSON.stringify(diagnostic);
  if (reported.has(identity)) return;
  if (reported.size >= reportLimit) {
    const oldest = reported.values().next();
    if (!oldest.done) reported.delete(oldest.value);
  }
  reported.add(identity);
  console.warn("[raypx:i18n]", diagnostic);
}

function hasMessage(catalog: unknown, path: readonly string[]): boolean {
  try {
    let value = catalog;
    for (const part of path) {
      if (typeof value !== "object" || value === null) return false;
      value = Object.getOwnPropertyDescriptor(value, part)?.value;
    }
    return typeof value === "string";
  } catch {
    // A diagnostic lookup must not make a dynamic catalog's fallback throw.
    return false;
  }
}

export function intlErrorHandlers(
  locale: string,
  options: IntlRuntimeOptions,
  catalogs: readonly unknown[],
) {
  const handled = new WeakSet();
  const onError: ErrorHandler = (error) => {
    // Translation fallback runs synchronously after onError and knows the key.
    queueMicrotask(() => {
      if (!handled.has(error)) report(locale, error.code);
    });
  };
  const getMessageFallback: MessageFallback = (details) => {
    const { error, namespace, key } = details;
    const qualified = namespace ? `${namespace}.${key}` : key;
    if (options.onError === undefined) {
      handled.add(error);
      // Runtime callers can pass arbitrary lookup strings. Only report paths
      // confirmed by the active or reference catalog.
      const known = catalogs.some((catalog) => hasMessage(catalog, qualified.split(".")));
      report(locale, error.code, known ? qualified : undefined);
    }
    return options.getMessageFallback?.(details) ?? qualified;
  };
  return { onError: options.onError ?? onError, getMessageFallback };
}
