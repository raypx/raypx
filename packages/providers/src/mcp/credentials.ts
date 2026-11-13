import type { McpHeaders } from "./port.js";

/** Include the token inside standard Authorization framing when checking echoes. */
export function mcpProtectedValues(headers: McpHeaders): string[] {
  const values = Object.values(headers).filter(Boolean);
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== "authorization") continue;
    const token = /^\S+\s+(.+)$/.exec(value)?.[1];
    if (token) values.push(token);
    if (/^basic\s/i.test(value) && token) {
      try {
        const decoded = Buffer.from(token, "base64").toString("utf8");
        values.push(decoded);
        const separator = decoded.indexOf(":");
        if (separator !== -1) values.push(decoded.slice(separator + 1));
      } catch {
        /* The complete supplied value remains protected. */
      }
    }
  }
  return [...new Set(values.filter(Boolean))];
}
