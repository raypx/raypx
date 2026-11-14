import { z } from "zod";
import { spaceIdSchema } from "./spaces.js";
import { conversationIdSchema } from "./agents.js";
import { runIdSchema } from "./conversation.js";

/** Header destinations cannot override routing, framing, cookies or protocol state. */
export const protectedHeaderSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9!#$%&'*+.^_`|~-]+$/)
  .refine(
    (name) =>
      !/^(host|cookie|set-cookie|origin|referer|connection|content-.*|accept|transfer-encoding|forwarded|proxy-.*|sec-.*|x-forwarded-.*|mcp-.*)$/i.test(
        name,
      ),
  );
export const commandInputDestinationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("environment"),
    variable: z.string().regex(/^[A-Z_][A-Z0-9_]{0,63}$/),
  }),
  z.strictObject({ kind: z.literal("stdin") }),
]);
export const httpInputDestinationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("http-bearer") }),
  z.strictObject({
    kind: z.literal("http-api-key"),
    in: z.enum(["header", "query"]),
    name: protectedHeaderSchema,
  }),
  z.strictObject({ kind: z.literal("http-basic") }),
]);

/** A destination is data, never permission. No value belongs in this schema. */
export const protectedInputSpecSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  purpose: z.string().trim().min(1).max(256),
  destination: z.union([
    commandInputDestinationSchema,
    httpInputDestinationSchema,
    z.strictObject({ kind: z.literal("mcp-header"), name: protectedHeaderSchema }),
  ]),
});
export type ProtectedInputSpec = z.infer<typeof protectedInputSpecSchema>;
export const protectedInputRequestSchema = z.strictObject({
  id: z.string().uuid(),
  spaceId: spaceIdSchema,
  conversationId: conversationIdSchema,
  runId: runIdSchema,
  memberAccountId: z.string().min(1),
  toolCallId: z.string().min(1).max(128),
  toolName: z.string().min(1).max(128),
  target: z.string().max(1024),
  input: protectedInputSpecSchema,
  untrustedInput: z.boolean(),
  provenanceKind: z.string().max(32).nullable(),
  state: z.enum(["pending", "answered", "declined", "expired", "consumed", "cancelled"]),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});
export type ProtectedInputRequest = z.infer<typeof protectedInputRequestSchema>;
/** Input-only; never include this in a cache, event, checkpoint or error. */
export const protectedInputAnswerSchema = z.discriminatedUnion("decision", [
  z.strictObject({
    decision: z.literal("answer"),
    value: z
      .string()
      .min(1)
      .max(4096)
      .refine((s) => !s.includes("\0")),
  }),
  z.strictObject({ decision: z.literal("decline") }),
]);
export type ProtectedInputAnswer = z.infer<typeof protectedInputAnswerSchema>;

/** Common encodings only: this is best-effort redaction, never information-flow isolation. */
export function protectedInputVariants(value: string): string[] {
  if (!value) return [];
  const url = encodeURIComponent(
    Array.from(value, (character) =>
      character.length === 1 && /[\uD800-\uDFFF]/.test(character) ? "\uFFFD" : character,
    ).join(""),
  );
  const bytes = Uint8Array.from(
    Array.from(url.matchAll(/%([a-f0-9]{2})|([^%])/gi), (match) =>
      match[1] ? Number.parseInt(match[1], 16) : match[2]!.charCodeAt(0),
    ),
  );
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64 = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    base64 += alphabet[a >> 2]! + alphabet[((a & 3) << 4) | (b >> 4)]!;
    base64 += i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)]! : "=";
    base64 += i + 2 < bytes.length ? alphabet[c & 63]! : "=";
  }
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const form = url
    .replace(/[!'()~]/g, (part) => `%${part.charCodeAt(0).toString(16).toUpperCase()}`)
    .replaceAll("%20", "+");
  const variants = new Set([
    value,
    base64,
    base64.replace(/=+$/, ""),
    base64.replaceAll("+", "-").replaceAll("/", "_"),
    base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""),
    hex,
    hex.toUpperCase(),
    url,
    url.replace(/%[A-F0-9]{2}/g, (part) => part.toLowerCase()),
    form,
    form.replace(/%[A-F0-9]{2}/g, (part) => part.toLowerCase()),
  ]);
  const originalVariants = Array.from(variants);
  for (const variant of originalVariants) {
    let escaped = variant;
    for (let depth = 0; depth < 5; depth++) {
      escaped = JSON.stringify(escaped).slice(1, -1);
      variants.add(escaped);
    }
  }
  return [...variants].filter(Boolean).sort((a, b) => b.length - a.length);
}
export function scrubProtectedValue(output: string, value: string): string {
  let result = output;
  for (const variant of protectedInputVariants(value))
    result = result.replaceAll(variant, "[protected]");
  return result;
}
/** Basic input is supplied as username:password, both fields remain protected. */
export function protectedInputParts(value: string, spec?: ProtectedInputSpec): string[] {
  if (spec?.destination.kind !== "http-basic") return [value];
  const separator = value.indexOf(":");
  return [value, value.slice(0, separator), value.slice(separator + 1)].filter(Boolean);
}
