/** Keep the protocol's UTF-16 size budget without splitting a Unicode code point. */
export function taskText(value: string, max: number, tail = false) {
  if (value.length <= max) return value;
  let boundary = tail ? value.length - max : max;
  const before = value.charCodeAt(boundary - 1),
    after = value.charCodeAt(boundary);
  if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff)
    boundary += tail ? 1 : -1;
  return tail ? value.slice(boundary) : value.slice(0, boundary);
}
/** JSON projections must be representable by PostgreSQL jsonb, including legacy data. */
export function normalizeTaskJson<T>(value: T): T {
  const string = (text: string) =>
    text.replaceAll("\0", "\ufffd").replace(/[\uD800-\uDFFF]/gu, "\ufffd");
  if (typeof value === "string") return string(value) as T;
  if (Array.isArray(value)) return value.map((item) => normalizeTaskJson(item)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [string(key), normalizeTaskJson(item)]),
    ) as T;
  return value;
}
