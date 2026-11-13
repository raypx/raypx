import { Hono } from "hono";
import { z } from "zod";
import { RoutineError, type RoutinesService } from "@raypx/jobs/routines";
import type { ApiRouterEnv } from "../routers/request.js";

export const MAX_ROUTINE_INGRESS_BYTES = 65_536;
const emailInput = z.strictObject({
  address: z.email().max(320),
  sender: z.email().max(320),
  messageId: z.string().min(1).max(512),
  text: z.string().max(32_000),
  subject: z.string().max(512).optional(),
});

class IngressError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "PAYLOAD_TOO_LARGE" | "UNAUTHORIZED") {
    super(code);
  }
}

/** Read and count actual stream bytes: Content-Length is only an early rejection. */
async function boundedBody(request: Request): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_ROUTINE_INGRESS_BYTES))
    throw new IngressError("PAYLOAD_TOO_LARGE");
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json")
    throw new IngressError("INVALID_INPUT");
  if (!request.body) throw new IngressError("INVALID_INPUT");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_ROUTINE_INGRESS_BYTES) {
        await reader.cancel();
        throw new IngressError("PAYLOAD_TOO_LARGE");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    JSON.parse(raw);
    return raw;
  } catch {
    throw new IngressError("INVALID_INPUT");
  }
}
function bearer(request: Request): string {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ") || value.length > 1024) throw new IngressError("UNAUTHORIZED");
  const token = value.slice(7);
  if (!token || /\s/.test(token)) throw new IngressError("UNAUTHORIZED");
  return token;
}
async function sameCredential(actual: string, expected: string): Promise<boolean> {
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encode.encode(actual)),
    crypto.subtle.digest("SHA-256", encode.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i]! ^ right[i]!;
  return difference === 0;
}
function requiredHeader(request: Request, name: string, limit = 512): string {
  const value = request.headers.get(name);
  if (!value || value.length > limit) throw new IngressError("INVALID_INPUT");
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) throw new IngressError("INVALID_INPUT");
  }
  return value;
}

/** Machine ingress has independent credentials; sessions and trusted browser Origins grant nothing. */
export function createRoutineIngressRoutes(options: {
  routines: Pick<RoutinesService, "webhook" | "email" | "repository">;
  emailRelayToken?: string;
}) {
  const app = new Hono<ApiRouterEnv>();
  app.use("*", async (c, next) => {
    c.header("cache-control", "no-store");
    await next();
  });
  app.onError((error, c) => {
    if (!(error instanceof IngressError) && !(error instanceof RoutineError)) {
      // Never send third-party errors (which can carry payloads or credentials) to a logger.
      return c.json({ error: { code: "SERVICE_UNAVAILABLE" } }, 503);
    }
    const code = error.code;
    if (code === "UNAUTHORIZED") return c.json({ error: { code } }, 401);
    if (code === "NOT_FOUND") return c.json({ error: { code } }, 404);
    if (code === "PAYLOAD_TOO_LARGE") return c.json({ error: { code } }, 413);
    if (code === "RATE_LIMITED") {
      c.header("retry-after", "60");
      return c.json({ error: { code } }, 429);
    }
    if (code === "BODY_MISMATCH" || code === "DISABLED") return c.json({ error: { code } }, 409);
    return c.json({ error: { code: "INVALID_INPUT" } }, 400);
  });
  app.post("/:routineId/webhook", async (c) => {
    const key = bearer(c.req.raw);
    const idempotencyKey = requiredHeader(c.req.raw, "idempotency-key");
    const raw = await boundedBody(c.req.raw);
    return c.json(
      await options.routines.webhook(c.req.param("routineId"), key, idempotencyKey, raw),
    );
  });
  app.post("/email", async (c) => {
    if (!options.emailRelayToken) throw new IngressError("UNAUTHORIZED");
    if (!(await sameCredential(bearer(c.req.raw), options.emailRelayToken)))
      throw new IngressError("UNAUTHORIZED");
    const raw = await boundedBody(c.req.raw);
    const parsed = emailInput.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new IngressError("INVALID_INPUT");
    const { subject, ...message } = parsed.data;
    return c.json(
      await options.routines.email({ ...message, ...(subject !== undefined ? { subject } : {}) }),
    );
  });
  app.post("/:routineId/repository", async (c) => {
    const signature = requiredHeader(c.req.raw, "x-routine-signature", 128);
    const deliveryId = requiredHeader(c.req.raw, "x-delivery-id");
    const eventKind = requiredHeader(c.req.raw, "x-event-kind", 100);
    const raw = await boundedBody(c.req.raw);
    return c.json(
      await options.routines.repository(
        c.req.param("routineId"),
        signature,
        deliveryId,
        eventKind,
        raw,
      ),
    );
  });
  return app;
}
