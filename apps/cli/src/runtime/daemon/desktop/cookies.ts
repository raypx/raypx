import { z } from "zod";
import { LocalError } from "../../errors.ts";
import { serverOrigin } from "../remote/origin.ts";

export const sessionLimit = 256 * 1024;
const authName = /^(?:__Secure-)?better-auth\.[a-zA-Z0-9_.-]+$/;
const cookieValue = /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/;
const cookiePath = (value: string) =>
  (value === "/" || value.startsWith("/api/") || value.startsWith("/rpc/")) &&
  !/[\s?#\\]/.test(value);
const cookieSchema = z.strictObject({
  name: z.string().max(16384).regex(authName),
  value: z.string().max(16384).regex(cookieValue),
  domain: z.string(),
  path: z.string().refine(cookiePath),
  secure: z.boolean(),
  httpOnly: z.boolean(),
  sameSite: z.enum(["none", "lax", "strict"]),
  expires: z.number().finite().optional(),
});
const storedSchema = z.strictObject({
  version: z.literal(1),
  cookies: z.array(cookieSchema).max(32),
});
type Cookie = z.infer<typeof cookieSchema>;
export interface CookieChange {
  cookie: Cookie;
  remove: boolean;
}
export interface SessionStore {
  load(): Uint8Array | undefined;
  save(value: Uint8Array | undefined): void;
}
const invalidCookie = () => new LocalError("INVALID_SESSION_COOKIE", "Invalid API session cookie");
const storageFailure = () =>
  new LocalError("SESSION_STORAGE_UNAVAILABLE", "Session storage unavailable; restart required");
function validForOrigin(cookie: Cookie, origin: URL) {
  return (
    cookie.domain === origin.hostname &&
    (!(origin.protocol === "https:" || cookie.name.startsWith("__Secure-")) ||
      (cookie.secure && cookie.httpOnly))
  );
}

/** The selected server may set auth cookies only; Domain never widens their destination. */
export function parseSessionCookie(
  origin: URL,
  raw: string,
  now = Date.now(),
): CookieChange | undefined {
  if (raw.length > 16384 || /[\r\n\0]/.test(raw)) throw invalidCookie();
  const parts = raw.split(";");
  const pair = parts.shift()!;
  const separator = pair.indexOf("=");
  const name = pair.slice(0, separator).trim();
  if (separator < 0 || !authName.test(name)) return;
  const value = pair.slice(separator + 1).trim();
  if (!cookieValue.test(value)) throw invalidCookie();
  const fields = new Map<string, string>();
  for (const part of parts) {
    const index = part.indexOf("=");
    const key = (index < 0 ? part : part.slice(0, index)).trim().toLowerCase();
    const attribute = index < 0 ? "" : part.slice(index + 1).trim();
    if (fields.has(key)) throw invalidCookie();
    fields.set(key, attribute);
  }
  const domain = fields.get("domain")?.toLowerCase().replace(/^\./, "");
  if (
    domain !== undefined &&
    (!domain || !(origin.hostname === domain || origin.hostname.endsWith(`.${domain}`)))
  )
    throw invalidCookie();
  const path = fields.get("path") || "/";
  const sameSite = (fields.get("samesite") ?? "none").toLowerCase();
  let expires: number | undefined;
  if (fields.has("expires")) {
    const date = Date.parse(fields.get("expires")!);
    if (!Number.isFinite(date)) throw invalidCookie();
    expires = date / 1000;
  }
  if (fields.has("max-age")) {
    const rawAge = fields.get("max-age")!;
    const age = Number(rawAge);
    if (!/^-?\d+$/.test(rawAge) || !Number.isSafeInteger(age)) throw invalidCookie();
    expires = Math.min(8_640_000_000_000, Math.max(-8_640_000_000_000, now / 1000 + age));
  }
  const parsed = cookieSchema.safeParse({
    name,
    value,
    domain: origin.hostname,
    path,
    secure: fields.has("secure"),
    httpOnly: fields.has("httponly"),
    sameSite,
    ...(expires === undefined ? {} : { expires }),
  });
  if (!parsed.success || !validForOrigin(parsed.data, origin)) throw invalidCookie();
  return { cookie: parsed.data, remove: expires !== undefined && expires <= now / 1000 };
}

/** Synchronous changes serialize cookie persistence with the profile's single writer. */
export class SessionCookies {
  readonly origin: URL;
  recovery: "temporary" | undefined;
  private values: Cookie[] = [];
  private store: SessionStore | undefined;
  private poisoned = false;
  private changed = false;
  constructor(
    origin: string,
    store?: SessionStore,
    private readonly now = Date.now,
  ) {
    this.origin = new URL(serverOrigin(origin));
    this.recover(store);
  }
  /** Validate the old row before allowing memory state to replace it. */
  recover(store?: SessionStore) {
    if (this.store && !this.poisoned) return;
    try {
      const data = store?.load();
      let values: Cookie[] = [];
      if (data) {
        if (data.byteLength > sessionLimit) throw invalidCookie();
        const input: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
        if (input && typeof input === "object" && "version" in input && input.version !== 1)
          throw new LocalError("SESSION_VERSION_UNSUPPORTED", "Unsupported stored session version");
        const stored = storedSchema.parse(input);
        if (stored.cookies.some((cookie) => !validForOrigin(cookie, this.origin)))
          throw invalidCookie();
        values = stored.cookies;
      }
      if (this.changed && !this.poisoned) this.persist(store, this.values);
      else this.values = values;
      this.store = store;
      this.poisoned = false;
      this.recovery = undefined;
    } catch (error) {
      if (error instanceof LocalError && error.code === "SESSION_VERSION_UNSUPPORTED") throw error;
      // Unreadable rows are preserved. This owner may sign in using memory only.
      this.recovery = "temporary";
    }
  }
  get retainInMemory() {
    return (
      this.recovery !== undefined ||
      this.poisoned ||
      this.values.some((cookie) => cookie.expires === undefined)
    );
  }
  private persist(store: SessionStore | undefined, values: Cookie[]) {
    const persistent = values.filter(
      (cookie) => cookie.expires !== undefined && cookie.expires > this.now() / 1000,
    );
    const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, cookies: persistent }));
    if (bytes.byteLength > sessionLimit) throw invalidCookie();
    store?.save(persistent.length ? bytes : undefined);
  }
  assertAvailable() {
    if (this.poisoned) throw storageFailure();
  }
  header(url: URL) {
    this.assertAvailable();
    if (url.origin !== this.origin.origin)
      throw new LocalError("INVALID_ORIGIN", "Invalid API origin");
    return this.values
      .filter(
        (cookie) =>
          (cookie.expires === undefined || cookie.expires > this.now() / 1000) &&
          (!cookie.secure || url.protocol === "https:") &&
          (url.pathname === cookie.path ||
            (url.pathname.startsWith(cookie.path) &&
              (cookie.path.endsWith("/") || url.pathname[cookie.path.length] === "/"))),
      )
      .sort((left, right) => right.path.length - left.path.length)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  }
  apply(changes: CookieChange[]) {
    this.assertAvailable();
    if (!changes.length) return;
    let next = this.values.filter(
      (cookie) => cookie.expires === undefined || cookie.expires > this.now() / 1000,
    );
    for (const { cookie, remove } of changes) {
      if (!cookieSchema.safeParse(cookie).success || !validForOrigin(cookie, this.origin))
        throw invalidCookie();
      next = next.filter((entry) => !(entry.name === cookie.name && entry.path === cookie.path));
      if (!remove) next.push(cookie);
    }
    if (next.length > 32) throw invalidCookie();
    try {
      this.persist(this.store, next);
    } catch {
      this.poisoned = true;
      this.values = [];
      throw storageFailure();
    }
    this.values = next;
    this.changed = true;
  }
}
