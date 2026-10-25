export function externalUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 8192 || /[\r\n\0]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
