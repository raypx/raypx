import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { githubJobEvents } from "@raypx/core/jobs";
import { taskText } from "@raypx/core/task-text";
import { LocalError } from "../errors.js";

const settingsSchema = z
  .strictObject({
    port: z.int().min(1).max(65_535),
    profile: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .default("default"),
    public_url: z
      .url()
      .refine((value) => {
        const url = new URL(value);
        return url.protocol === "https:" && url.href === `${url.origin}/`;
      })
      .optional(),
    email_domain: z
      .hostname()
      .refine((value) => value.includes("."))
      .toLowerCase()
      .optional(),
    email_relay_key: z
      .string()
      .regex(/^[A-Za-z0-9_-]{32,128}$/)
      .optional(),
  })
  .refine((settings) => Boolean(settings.email_domain) === Boolean(settings.email_relay_key));
export type RoutineIngressSettings = z.output<typeof settingsSchema>;

export function loadRoutineIngress() {
  try {
    const directory = process.env.RAYPX_HOME ?? join(homedir(), ".raypx");
    if (!isAbsolute(directory)) throw new Error();
    const file = join(directory, "config.toml");
    const info = statSync(file);
    if (!info.isFile() || info.size > 16 * 1024) throw new Error();
    const settings = (Bun.TOML.parse(readFileSync(file, "utf8")) as Record<string, unknown>)
      .routine_ingress;
    return settings === undefined ? undefined : settingsSchema.parse(settings);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw new LocalError("INVALID_ROUTINE_INGRESS", "Check [routine_ingress] in config.toml");
  }
}

export function matchesBearer(header: string | null, key: string) {
  if (!header?.startsWith("Bearer ")) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header.slice(7)), digest(key));
}

export function matchesGitHubSignature(signature: string | null, body: Uint8Array, key: string) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signature.slice(7), "hex"),
    createHmac("sha256", key).update(body).digest(),
  );
}

export function routineEmail(id: string, domain: string) {
  return `${id}@${domain}`;
}

const mailbox = z.string().trim().toLowerCase().pipe(z.email().max(254));
const mailSchema = z.strictObject({
  to: mailbox,
  from: mailbox,
  recipients: z.array(mailbox).max(100),
  messageId: z.string().trim().min(1).max(512),
  subject: z.string().max(998),
  text: z.string().max(16_000),
});

export type RoutineDelivery =
  | { type: "webhook"; id: string; data: string; authorization: string | null }
  | { type: "email"; id: string; data: string; sender: string }
  | {
      type: "github";
      id: string;
      data: string;
      repository: string;
      event: (typeof githubJobEvents)[number];
      signature: string | null;
      body: Uint8Array;
    }
  | { type: "files"; id: string; data: string; snapshot: string; previous: string; watch: string };
type Deliver = (jobId: string, delivery: RoutineDelivery) => Promise<{ accepted: boolean }>;

function json(value: unknown, status: number) {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

const webhookPath = /^\/routines\/(webhook|github)\/([^/]+)$/;
const emailPath = "/routines/email";
const maxBody = 64 * 1024;
const githubBody = 1024 * 1024;
const maxConcurrentDeliveries = 16;

async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new LocalError("BODY_TOO_LARGE", "Trigger body is too large");
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new LocalError("BODY_TOO_LARGE", "Trigger body is too large");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    void reader.cancel().catch(() => {});
  }
}

const githubItem = z.object({
  number: z.int().positive(),
  title: z.string(),
  body: z.string().nullable().optional(),
  html_url: z.string(),
});
const githubPayload = z.object({
  repository: z.object({ full_name: z.string().max(200) }),
  action: z.string().max(80).optional(),
  ref: z.string().max(1024).optional(),
  before: z.string().max(128).optional(),
  after: z.string().max(128).optional(),
  issue: githubItem.optional(),
  pull_request: githubItem.optional(),
});

function githubDelivery(
  request: Request,
  payload: unknown,
  body: Uint8Array,
  signature: string | null,
): RoutineDelivery | undefined {
  const event = z.enum(githubJobEvents).safeParse(request.headers.get("x-github-event"));
  if (!event.success) return;
  const id = z.uuid().parse(request.headers.get("x-github-delivery"));
  const { repository, issue, pull_request, ...fields } = githubPayload.parse(payload);
  let item: z.output<typeof githubItem> | undefined;
  if (event.data === "push") {
    if (!fields.ref || !fields.before || !fields.after || issue || pull_request)
      throw new SyntaxError("Invalid GitHub push payload");
  } else {
    item = event.data === "issues" ? issue : pull_request;
    if (!item || !fields.action || fields.ref || (issue && pull_request))
      throw new SyntaxError("Invalid GitHub item payload");
  }
  const name = repository.full_name.toLowerCase();
  const data = JSON.stringify({
    event: event.data,
    repository: name,
    ...fields,
    ...(item
      ? {
          number: item.number,
          title: taskText(item.title, 300),
          url: taskText(item.html_url, 1000),
          body: item.body ? taskText(item.body, 1500) : item.body,
        }
      : {}),
  });
  return { type: "github", id, data, repository: name, event: event.data, signature, body };
}

export function startRoutineIngress(
  settings: RoutineIngressSettings,
  webhookKey: (id: string, trigger: "webhook" | "github") => string | undefined,
  deliver: Deliver,
) {
  let pending = 0;
  try {
    return Bun.serve({
      hostname: "127.0.0.1",
      port: settings.port,
      maxRequestBodySize: githubBody,
      idleTimeout: 10,
      async fetch(request) {
        if (request.method !== "POST" || request.headers.has("origin"))
          return json({ error: "NOT_FOUND" }, 404);
        const path = new URL(request.url).pathname;
        const match = webhookPath.exec(path);
        const github = match?.[1] === "github";
        const webhookId = z.uuid().safeParse(match?.[2]);
        const emailKey = path === emailPath ? settings.email_relay_key : undefined;
        if (!webhookId.success && !emailKey) return json({ error: "NOT_FOUND" }, 404);
        const authorization = request.headers.get("authorization");
        const signature = request.headers.get("x-hub-signature-256");
        let githubKey: string | undefined;
        if (emailKey && !matchesBearer(authorization, emailKey))
          return json({ error: "UNAUTHORIZED" }, 401);
        if (webhookId.success) {
          if (
            github
              ? !/^sha256=[a-f0-9]{64}$/.test(signature ?? "")
              : !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization ?? "")
          )
            return json({ error: "UNAUTHORIZED" }, 401);
          try {
            const key = webhookKey(webhookId.data, github ? "github" : "webhook");
            if (!key || (!github && !matchesBearer(authorization, key)))
              return json({ error: "UNAUTHORIZED" }, 401);
            if (github) githubKey = key;
          } catch {
            return json({ error: "UNAVAILABLE" }, 503);
          }
        }
        if (
          request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
          "application/json"
        )
          return json({ error: "UNSUPPORTED_MEDIA_TYPE" }, 415);
        if (pending >= maxConcurrentDeliveries) return json({ error: "UNAVAILABLE" }, 503);
        pending++;
        let result: unknown;
        try {
          const body = await boundedBody(request, github ? githubBody : maxBody);
          if (github && (!githubKey || !matchesGitHubSignature(signature, body, githubKey)))
            return json({ error: "UNAUTHORIZED" }, 401);
          let raw: string;
          try {
            raw = new TextDecoder("utf-8", { fatal: true }).decode(body);
          } catch {
            throw new SyntaxError("Invalid UTF-8 body");
          }
          const payload: unknown = JSON.parse(raw);
          if (github && webhookId.success) {
            const delivery = githubDelivery(request, payload, body, signature);
            result = delivery ? await deliver(webhookId.data, delivery) : { accepted: false };
          } else if (webhookId.success) {
            const id = request.headers.get("idempotency-key");
            if (!id || !/^[\w.:-]{1,128}$/.test(id))
              return json({ error: "INVALID_DELIVERY_ID" }, 400);
            if (raw.length > 16_000) return json({ error: "BODY_TOO_LARGE" }, 413);
            result = await deliver(webhookId.data, {
              type: "webhook",
              id,
              data: JSON.stringify(payload),
              authorization,
            });
          } else {
            const mail = mailSchema.parse(payload);
            const [id, domain] = mail.to.split("@");
            const recipient = z.uuid().safeParse(id);
            if (
              domain !== settings.email_domain ||
              !mail.recipients.includes(mail.to) ||
              !recipient.success
            )
              return json({ accepted: false }, 202);
            const data = JSON.stringify({
              from: mail.from,
              subject: mail.subject,
              text: mail.text,
            });
            result = await deliver(recipient.data, {
              type: "email",
              id: mail.messageId,
              data,
              sender: mail.from,
            });
          }
        } catch (error) {
          if (error instanceof SyntaxError || error instanceof z.ZodError)
            return json({ error: "INVALID_JSON" }, 400);
          if (error instanceof LocalError) {
            if (error.code === "UNAUTHORIZED") return json({ error: error.code }, 401);
            if (error.code === "DELIVERY_CONFLICT") return json({ error: error.code }, 409);
            if (error.code === "BODY_TOO_LARGE") return json({ error: error.code }, 413);
            if (error.code === "JOB_NOT_FOUND" || error.code === "JOB_PAUSED")
              return emailKey ? json({ accepted: false }, 202) : json({ error: error.code }, 404);
          }
          return json({ error: "UNAVAILABLE" }, 503);
        } finally {
          pending--;
        }
        return json(result, 202);
      },
      error: () => json({ error: "UNAVAILABLE" }, 503),
    });
  } catch {
    throw new LocalError("ROUTINE_INGRESS_UNAVAILABLE", "Unable to bind the routine ingress port");
  }
}
