import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { NativeCookies, CookieMutation } from "./api";
import { parseServerOrigin } from "../config";

type Cookie = ReturnType<NativeCookies["get"]>[number];
export const SESSION_KEY_SERVICE = "com.raypx.desktop.session";
export function sessionKeyName(directory: string) {
  return createHash("sha256").update(resolve(directory, "session.enc")).digest("hex");
}
interface KeyStore {
  get(options: { service: string; name: string }): Promise<string | null>;
  set(options: { service: string; name: string; value: string; persist: "local" }): Promise<void>;
}
class SessionKeyUnavailable extends Error {}

/** CEF's Windows SDK has no cookie implementation. Keep its native HTTP jar encrypted. */
async function openEncryptedCookies(
  directory: string,
  rawOrigin: string,
  keys: KeyStore = Bun.secrets,
): Promise<NativeCookies> {
  const origin = parseServerOrigin(rawOrigin);
  const hostname = new URL(origin).hostname;
  const file = join(directory, "session.enc");
  const identity = { service: SESSION_KEY_SERVICE, name: sessionKeyName(directory) };
  let encoded = await keys.get(identity);
  if (encoded === null) {
    if (existsSync(file)) throw new Error("Native session encryption key unavailable");
    await keys.set({ ...identity, value: randomBytes(32).toString("base64"), persist: "local" });
    encoded = await keys.get(identity);
  }
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw new Error("Invalid native session key");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("Invalid native session key");
  function valid(value: unknown): value is Cookie {
    if (!value || typeof value !== "object") return false;
    const cookie = value as Cookie;
    return (
      typeof cookie.name === "string" &&
      /^(?:__Secure-)?better-auth\.[a-zA-Z0-9_.-]+$/.test(cookie.name) &&
      typeof cookie.value === "string" &&
      cookie.value.length <= 16_384 &&
      !/[\r\n;]/.test(cookie.value) &&
      cookie.domain === hostname &&
      typeof cookie.path === "string" &&
      cookie.path.startsWith("/") &&
      typeof cookie.secure === "boolean" &&
      typeof cookie.httpOnly === "boolean" &&
      (cookie.expirationDate === undefined || Number.isFinite(cookie.expirationDate))
    );
  }
  let values: Cookie[] = [];
  if (existsSync(file)) {
    if (statSync(file).size > 512 * 1024) throw new Error("Native session exceeds limit");
    const sealed = readFileSync(file);
    if (sealed.length < 30 || sealed[0] !== 1) throw new Error("Invalid native session data");
    let plain: Buffer;
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(1, 13));
      decipher.setAAD(Buffer.from(origin));
      decipher.setAuthTag(sealed.subarray(13, 29));
      plain = Buffer.concat([decipher.update(sealed.subarray(29)), decipher.final()]);
    } catch {
      throw new Error("Native session authentication failed");
    }
    try {
      const parsed: unknown = JSON.parse(plain.toString("utf8"));
      if (!Array.isArray(parsed) || parsed.length > 32 || !parsed.every(valid))
        throw new Error("Invalid native session data");
      values = parsed;
    } finally {
      plain.fill(0);
    }
  }
  const alive = (cookie: Cookie) =>
    cookie.expirationDate === undefined || cookie.expirationDate > Date.now() / 1000;
  function save(next: Cookie[]) {
    const temporary = file + "." + crypto.randomUUID() + ".tmp";
    const plain = Buffer.from(
      JSON.stringify(next.filter((cookie) => cookie.expirationDate !== undefined && alive(cookie))),
    );
    try {
      if (next.length > 32 || plain.length > 256 * 1024) return false;
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(Buffer.from(origin));
      const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      writeFileSync(
        temporary,
        Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), encrypted]),
        { mode: 0o600, flag: "wx" },
      );
      renameSync(temporary, file);
      values = next;
      return true;
    } catch {
      return false;
    } finally {
      plain.fill(0);
      try {
        rmSync(temporary, { force: true });
      } catch {
        /* Preserve the original persistence failure. */
      }
    }
  }
  return {
    apply(changes) {
      const next = applyCookies(values, changes);
      return next.every(valid) && save(next);
    },
    get({ url }) {
      const target = new URL(url);
      if (target.origin !== origin) return [];
      return values
        .filter(
          (cookie) =>
            alive(cookie) &&
            target.pathname.startsWith(cookie.path!) &&
            (!cookie.secure || target.protocol === "https:"),
        )
        .map((cookie) => ({ ...cookie }));
    },
    set(cookie) {
      if (!valid(cookie)) return false;
      return save([
        ...values.filter(
          (value) => alive(value) && (value.name !== cookie.name || value.path !== cookie.path),
        ),
        { ...cookie },
      ]);
    },
    remove(url, name) {
      const target = new URL(url);
      if (target.origin !== origin) return false;
      return save(
        values.filter(
          (cookie) =>
            alive(cookie) && (cookie.name !== name || !target.pathname.startsWith(cookie.path!)),
        ),
      );
    },
  };
}

/** Unreadable credentials never prevent local startup and are never stored in plaintext. */
export async function createEncryptedCookies(
  directory: string,
  rawOrigin: string,
  keys: KeyStore = Bun.secrets,
  report?: (recovery: { kind: "reset" | "temporary"; path: string }) => void,
): Promise<NativeCookies> {
  const origin = parseServerOrigin(rawOrigin),
    file = join(directory, "session.enc");
  const availableKeys: KeyStore = {
    async get(options) {
      try {
        return await keys.get(options);
      } catch {
        throw new SessionKeyUnavailable();
      }
    },
    async set(options) {
      try {
        await keys.set(options);
      } catch {
        throw new SessionKeyUnavailable();
      }
    },
  };
  try {
    return await openEncryptedCookies(directory, origin, availableKeys);
  } catch (error) {
    if (error instanceof SessionKeyUnavailable) {
      report?.({ kind: "temporary", path: file });
      return createMemoryCookies(origin);
    }
    try {
      if (existsSync(file)) renameSync(file, `${file}.corrupt-${crypto.randomUUID()}`);
      await availableKeys.set({
        service: SESSION_KEY_SERVICE,
        name: sessionKeyName(directory),
        value: randomBytes(32).toString("base64"),
        persist: "local",
      });
      const result = await openEncryptedCookies(directory, origin, availableKeys);
      report?.({ kind: "reset", path: file });
      return result;
    } catch {
      report?.({ kind: "temporary", path: file });
      return createMemoryCookies(origin);
    }
  }
}

export function createMemoryCookies(origin: string): NativeCookies {
  let values: Cookie[] = [];
  const host = new URL(origin).hostname;
  const valid = (cookie: Cookie) =>
    cookie.domain === host &&
    /^(?:__Secure-)?better-auth\.[a-zA-Z0-9_.-]+$/.test(cookie.name) &&
    typeof cookie.value === "string" &&
    cookie.value.length <= 16_384 &&
    !/[\r\n;]/.test(cookie.value) &&
    typeof cookie.path === "string" &&
    cookie.path.startsWith("/");
  return {
    get({ url }) {
      const target = new URL(url);
      return target.origin === origin
        ? values
            .filter(
              (cookie) =>
                target.pathname.startsWith(cookie.path!) &&
                (!cookie.secure || target.protocol === "https:") &&
                (cookie.expirationDate === undefined || cookie.expirationDate > Date.now() / 1000),
            )
            .map((cookie) => ({ ...cookie }))
        : [];
    },
    set(cookie) {
      if (!valid(cookie)) return false;
      values = [
        ...values.filter((value) => value.name !== cookie.name || value.path !== cookie.path),
        { ...cookie },
      ];
      return true;
    },
    remove(url, name) {
      if (new URL(url).origin !== origin) return false;
      values = values.filter((cookie) => cookie.name !== name);
      return true;
    },
    apply(changes) {
      const next = applyCookies(values, changes);
      if (next.length > 32 || !next.every(valid)) return false;
      values = next;
      return true;
    },
  };
}

function applyCookies(values: Cookie[], changes: CookieMutation[]): Cookie[] {
  let result = values.map((cookie) => ({ ...cookie }));
  for (const change of changes) {
    if ("cookie" in change)
      result = [
        ...result.filter(
          (cookie) => cookie.name !== change.cookie.name || cookie.path !== change.cookie.path,
        ),
        { ...change.cookie },
      ];
    else
      result = result.filter(
        (cookie) =>
          cookie.name !== change.name ||
          !new URL(change.url).pathname.startsWith(cookie.path ?? "/"),
      );
  }
  return result;
}
