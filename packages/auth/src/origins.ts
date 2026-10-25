/** Normalize explicit trusted origins; malformed/opaque entries never grant access. */
export function normalizeTrustedOrigins(values: readonly string[]): string[] {
  return [
    ...new Set(
      values.flatMap((value) => {
        try {
          const url = new URL(value.trim());
          if (url.username || url.password || url.hostname.includes("*")) return [];
          if (url.protocol === "views:" && url.hostname === "main") return ["views://main"];
          return ["http:", "https:"].includes(url.protocol) && url.origin !== "null"
            ? [url.origin]
            : [];
        } catch {
          return [];
        }
      }),
    ),
  ];
}
