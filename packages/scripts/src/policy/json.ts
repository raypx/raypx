export function parseJson(content: string): { valid: true; value: unknown } | { valid: false } {
  try {
    return { valid: true, value: JSON.parse(content) };
  } catch {
    return { valid: false };
  }
}
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
