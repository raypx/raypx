import { z } from "zod";
import type { BrowserCommand, BrowserView } from "@raypx/core/browser";
import type { browserDriver, BrowserFrame } from "./driver.js";

const fieldSelector =
  'input:not([type]),input[type="text" i],input[type="search" i],input[type="email" i],input[type="tel" i],input[type="url" i],input[type="number" i],textarea';
const inspect = `(() => {
  const fields = Array.from(document.querySelectorAll(${JSON.stringify(fieldSelector)}))
    .filter((field) => field.name && !field.disabled && !field.readOnly && field.getClientRects().length)
    .slice(0, 100)
    .map((field) => ({ name: field.name.slice(0, 121), label: (field.labels?.[0]?.textContent || field.getAttribute("aria-label") || field.name).trim().slice(0, 160) }));
  const names = new Map();
  const named = document.querySelectorAll("[name]");
  if (named.length > 2000) return { href: location.href, fields: [] };
  for (const field of named) names.set(field.getAttribute("name"), (names.get(field.getAttribute("name")) || 0) + 1);
  return { href: location.href, fields: fields.filter((field) => names.get(field.name) === 1 && /^[a-zA-Z0-9_.[\\]\\-]{1,120}$/.test(field.name)).slice(0, 24) };
})()`;
const inspection = z.object({
  result: z.object({
    href: z.string().url().max(2_048),
    fields: z
      .array(z.object({ name: z.string().min(1).max(120), label: z.string().max(160) }))
      .max(24),
  }),
});
const accepted = { accepted: true } as const;
const controlTtl = 25_000;
const idleTtl = 600_000;
const lifetime = 1_800_000;
type Inspection = z.infer<typeof inspection>["result"];
interface Session {
  id: string;
  origin: string;
  createdAt: number;
  activeAt: number;
  frame: BrowserFrame | null;
  stopFrames?: () => void;
  form?: { token: string; inspection: Inspection };
  control?: { token: string; expiresAt: number };
}

export function createBrowserBroker(
  driver: ReturnType<typeof browserDriver>,
  hosts: ReadonlySet<string>,
  capacity = 8,
) {
  const sessions = new Map<string, Session>();
  const queued = new Map<string, Promise<unknown>>();
  function admittedOrigin(value: string) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !hosts.has(url.hostname))
      throw new Error("BROWSER_DESTINATION_UNAVAILABLE");
    return url.origin;
  }
  function control(session: Session) {
    if (session.control && session.control.expiresAt > Date.now()) return session.control;
    if (session.control) {
      delete session.control;
      delete session.form;
    }
    return undefined;
  }
  function view(session: Session | undefined, token?: string): BrowserView {
    if (!session) return { state: "closed" };
    const claimed = control(session);
    if (claimed && claimed.token === token) claimed.expiresAt = Date.now() + controlTtl;
    return { state: "open", origin: session.origin, controlled: !!claimed, frame: session.frame };
  }
  async function diagnose(session: Session, signal: AbortSignal) {
    const [result] = await driver.command(session.id, [["eval", inspect]], signal);
    const form = inspection.parse(result).result;
    session.origin = admittedOrigin(form.href);
    return form;
  }
  async function close(key: string, session: Session) {
    sessions.delete(key);
    session.stopFrames?.();
    await driver.command(session.id, [["close"]]).catch(() => {});
  }
  async function dispatch(
    key: string,
    request: Exclude<BrowserCommand, { op: "view" }>,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const session = sessions.get(key);
    if (request.op === "open") {
      const origin = admittedOrigin(request.url);
      if (session) await close(key, session);
      if (sessions.size >= capacity) throw new Error("BROWSER_CAPACITY");
      const next: Session = {
        id: crypto.randomUUID(),
        origin,
        createdAt: Date.now(),
        activeAt: Date.now(),
        frame: null,
      };
      sessions.set(key, next);
      try {
        await driver.command(
          next.id,
          [
            ["open", request.url],
            ["set", "viewport", "1280", "800"],
          ],
          signal,
        );
        next.stopFrames = await driver.frames(
          next.id,
          (frame) => {
            next.frame = frame;
          },
          signal,
        );
        return view(next);
      } catch {
        await close(key, next);
        throw new Error("BROWSER_COMMAND_FAILED");
      }
    }
    if (!session) {
      if (request.op === "close") return accepted;
      throw new Error("BROWSER_CLOSED");
    }
    session.activeAt = Date.now();
    if (request.op === "close") {
      await close(key, session);
      return accepted;
    }
    const claimed = control(session);
    if (request.op === "takeover") {
      if (claimed && claimed.token !== request.token) throw new Error("BROWSER_CONTROLLED");
      session.control = { token: request.token, expiresAt: Date.now() + controlTtl };
      delete session.form;
      return view(session);
    }
    if (request.op === "release" || request.op === "input") {
      if (claimed?.token !== request.token) throw new Error("BROWSER_CONTROL_REQUIRED");
      if (request.op === "release") {
        delete session.control;
        return view(session);
      }
      const input = request.input;
      switch (input.kind) {
        case "click":
          await driver.command(
            session.id,
            [
              ["mouse", "move", String(input.x), String(input.y)],
              ["mouse", "down", "left"],
              ["mouse", "up", "left"],
            ],
            signal,
          );
          break;
        case "scroll":
          await driver.command(session.id, [["mouse", "wheel", String(input.delta)]], signal);
          break;
        case "key":
          await driver.command(session.id, [["press", input.key]], signal);
          break;
        case "text":
          await driver.command(session.id, [["keyboard", "inserttext", input.text]], signal);
          break;
      }
      claimed.expiresAt = Date.now() + controlTtl;
      return accepted;
    }
    if (claimed) throw new Error("BROWSER_CONTROLLED");
    if (request.op === "inspect") {
      const form = await diagnose(session, signal);
      const token = crypto.randomUUID();
      session.form = { token, inspection: form };
      return { formToken: token, origin: session.origin, fields: form.fields };
    }
    const plan = session.form;
    if (!plan || plan.token !== request.formToken || request.origin !== session.origin)
      throw new Error("BROWSER_FORM_CHANGED");
    delete session.form;
    const names = new Set(plan.inspection.fields.map((field) => field.name));
    if (request.fields.some(({ name }) => !names.has(name)))
      throw new Error("BROWSER_FORM_CHANGED");
    let filled = 0;
    for (const { name, value } of request.fields) {
      const current = await diagnose(session, signal);
      if (JSON.stringify(current) !== JSON.stringify(plan.inspection))
        return { filled, state: "changed" };
      await driver.command(
        session.id,
        [["fill", `:is(${fieldSelector})[name=${JSON.stringify(name)}]`, "--", value]],
        signal,
      );
      filled++;
    }
    return { filled, state: "succeeded" };
  }
  function run(
    key: string,
    request: BrowserCommand,
    signal = AbortSignal.timeout(18_000),
  ): Promise<unknown> {
    if (request.op === "view") {
      const session = sessions.get(key);
      if (session) session.activeAt = Date.now();
      return Promise.resolve(view(session, request.token));
    }
    const previous = queued.get(key);
    // One in-flight operation per session. A queued takeover cannot interleave a fill.
    if (previous) return Promise.reject(new Error("BROWSER_BUSY"));
    const pending = dispatch(key, request, signal).finally(() => {
      queued.delete(key);
    });
    queued.set(key, pending);
    return pending;
  }
  async function sweep() {
    const now = Date.now();
    await Promise.allSettled(
      [...sessions].flatMap(([key, session]) =>
        now - session.activeAt > idleTtl || now - session.createdAt > lifetime
          ? [run(key, { op: "close" })]
          : [],
      ),
    );
  }
  async function shutdown() {
    await Promise.allSettled(queued.values());
    await Promise.allSettled([...sessions].map(([key, session]) => close(key, session)));
  }
  return { run, sweep, shutdown };
}
