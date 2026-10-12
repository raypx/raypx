export const uiPropertyNames = new Set([
  "alt",
  "ariaDescription",
  "ariaLabel",
  "description",
  "detail",
  "empty",
  "error",
  "fallback",
  "heading",
  "helperText",
  "label",
  "message",
  "placeholder",
  "subtitle",
  "text",
  "title",
  "tooltip",
]);

export const uiAttributeNames = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-valuetext",
  "placeholder",
  "title",
]);

export const uiVariableSuffix =
  /(?:Label|Title|Description|Message|Text|Placeholder|Tooltip|Heading|Subtitle)$/u;

// `content` is intentionally limited to conditional object expressions below:
// metadata uses it for descriptions, while transport and chat payloads also
// use the same property for arbitrary user data.
export const conditionalUiPropertyNames = new Set([...uiPropertyNames, "content"]);

const allowedLiteralValues = new Set(["Pi", "VoidMix", "Voidmix", "VOIDMIX", "Northstar"]);

const technicalJsxTextPatterns = [
  // Keyboard shortcuts and initials are visual affordances, not locale copy.
  /^[A-Za-z]$/u,
  // A version prefix may be adjacent to a dynamic version expression.
  /^v(?:\d+(?:\.\d+){1,3})?$/iu,
  // Size/unit suffixes are structural metadata (for example `· ≤512 KB`).
  /^[·•]\s*[<>=≤≥]?\s*\d+(?:\.\d+)?\s*(?:B|KB|MB|GB|TB)$/iu,
  // Product/workspace breadcrumbs keep a brand and a route-like segment.
  /^(?:VOIDMIX|Voidmix)(?:\s*\/\s*[A-Za-z][A-Za-z0-9 _-]*)?\s*\/?$/u,
  // A separator followed by a route-like segment is the other half of a
  // dynamic brand breadcrumb (`{workspace} / Chat`).
  /^\/\s*[A-Za-z][A-Za-z0-9 _-]*$/u,
  /^Northstar(?:\s+Workspace)?$/u,
];

export const sourceFacadeAllowlist = new Set([
  "apps/web/src/i18n/client.ts",
  "apps/desktop/src/i18n/client.ts",
]);

export const sourceRecoveryAllowlist = new Set([
  "apps/web/src/i18n/recovery-messages.ts",
  "apps/web/src/i18n/error-message.ts",
]);

export const operationalSourceAllowlist = [
  /^packages\/mail\/src\/(?:env|service|transports)\//,
  /^packages\/mail\/src\/service\.ts$/,
  /^apps\/(?:web|desktop)\/src\/env\.ts$/,
];

// These modules contain transport/domain snapshots. Their strings are data
// rendered through a resolver at the UI boundary, so property-name heuristics
// must not treat them as copy. JSX and explicit accessibility attributes are
// still checked when they occur in a component source file.
export const structuredDataSourceAllowlist = [
  /(?:^|\/)preview-adapter\.[jt]sx?$/u,
  /(?:^|\/)remote-adapter\.[jt]sx?$/u,
  /(?:^|\/)fixtures\.[jt]sx?$/u,
  /(?:^|\/)types\.[jt]sx?$/u,
  /(?:^|\/)lib\/project-studio\.[jt]sx?$/u,
];

export function isLikelyHumanText(value: string): boolean {
  const normalized = value.replace(/\s+/g, " ").trim();
  return Boolean(
    normalized &&
    /[A-Za-z\u00c0-\u024f\u4e00-\u9fff]/u.test(normalized) &&
    !allowedLiteralValues.has(normalized) &&
    !/^(?:https?|mailto|data):/u.test(normalized) &&
    !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/u.test(normalized),
  );
}

export function isLikelyJsxText(value: string): boolean {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || !/[A-Za-z\u00c0-\u024f\u4e00-\u9fff]/u.test(normalized)) return false;
  if (allowedLiteralValues.has(normalized)) return false;
  if (/^(?:https?|mailto|data):/u.test(normalized)) return false;
  if (technicalJsxTextPatterns.some((pattern) => pattern.test(normalized))) return false;
  // Once a value has been parsed as a JSX text node, it is copy by definition;
  // a lower-case one-word label (for example `hello`) is still visible UI.
  // Entity-only whitespace such as `&nbsp;` is the one common non-copy case.
  return !/^(?:&(?:[A-Za-z][A-Za-z0-9]+|#\d+);\s*)+$/u.test(normalized);
}

export function hasTranslationSibling(source: string, offset: number, property: string): boolean {
  const window = source.slice(Math.max(0, offset - 640), Math.min(source.length, offset + 640));
  const siblingNames = new Set<string>([
    `${property}Key`,
    ...(property === "label" ? ["messageKey", "nameKey"] : []),
    ...(property === "text" ? ["messageKey", "textKey"] : []),
  ]);
  return [...siblingNames].some((name) => new RegExp(`\\b${name}\\s*:`, "u").test(window));
}

export function isLikelyTranslationKey(value: string): boolean {
  // Lower-camel identifiers are commonly catalog keys or domain enum values
  // (`campaignExports`, `open`, `in_progress`). Human copy with spaces or
  // sentence punctuation remains subject to the UI-property check.
  return /^[a-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*$/u.test(value);
}
