import { desktopLoginRequests, desktopEventsRequests } from "@raypx/contracts/desktop";
import { BrowserLogin } from "./browser-login.js";
import { accountProfileSchema } from "@raypx/contracts/api";
import { z } from "zod";
import { localParams } from "@raypx/contracts/local";
import { localResults } from "@raypx/contracts/local-client";
import type { LocalRuntime } from "../../index.js";
type DesktopHost = Pick<LocalRuntime, "request">;
import { LocalError } from "../../errors.js";
import type { DesktopApi } from "./api.js";

/** Requests that replace or end the cookie session this control verified its account with. */
const sessionMutations = new Set([
  "/api/auth/sign-in/email",
  "/api/auth/sign-up/email",
  "/api/auth/sign-out",
]);
const accountId = z.string().min(1).max(200);
const unauthorized = () => new LocalError("AUTH_REQUIRED", "AUTH_REQUIRED");
/** Account and renderer policy. The native host supplies configuration, never account assertions. */
export class DesktopControl {
  private selection = new AbortController();
  private httpScope = new AbortController();
  private readonly browserLogin: BrowserLogin;
  constructor(
    private readonly api: DesktopApi,
    private readonly host: DesktopHost,
  ) {
    this.browserLogin = new BrowserLogin(api, () => {
      this.httpScope.abort();
      this.httpScope = new AbortController();
      this.deselect();
    });
  }
  private get origin() {
    return this.api.cookies.origin.origin;
  }
  private async verify(account: string, signal: AbortSignal) {
    const profile = accountProfileSchema.parse(await this.api.rpc("account.get", {}, signal));
    signal.throwIfAborted();
    if (profile.id !== account) throw unauthorized();
  }
  /** Forgets the verified account in this control without telling the daemon to detach. */
  private deselect() {
    this.api.events.closeAll();
    this.selection.abort();
    this.selection = new AbortController();
  }
  async select(account: string | null, _client: string, parent: AbortSignal) {
    this.api.events.closeAll();
    this.selection.abort();
    const selection = new AbortController();
    this.selection = selection;
    const signal = AbortSignal.any([selection.signal, parent]);
    if (account !== null) await this.verify(account, signal);
    signal.throwIfAborted();
    return true;
  }
  /** Native-only current session identity; never exposed by the renderer router. */
  async nativeIdentity(signal: AbortSignal) {
    const scope = this.httpScope;
    const operation = AbortSignal.any([signal, scope.signal]);
    try {
      const account = accountProfileSchema.parse(await this.api.rpc("account.get", {}, operation));
      operation.throwIfAborted();
      if (this.httpScope !== scope) throw unauthorized();
      return { accountId: account.id, serverOrigin: this.origin };
    } catch (error) {
      if (error instanceof LocalError && error.code === "AUTH_REQUIRED") return null;
      throw error;
    }
  }
  async request(
    method: string,
    raw: unknown,
    client: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    signal.throwIfAborted();
    if (method === "events_open") {
      const input = desktopEventsRequests.events_open.parse(raw);
      const scope = AbortSignal.any([signal, this.httpScope.signal, this.selection.signal]);
      await this.verify(input.accountId, scope);
      scope.throwIfAborted();
      return this.api.events.open(client, input.id, scope);
    }
    if (method === "events_read") {
      const input = desktopEventsRequests.events_read.parse(raw);
      return this.api.events.read(client, input.id, signal);
    }
    if (method === "events_send") {
      const input = desktopEventsRequests.events_send.parse(raw);
      return this.api.events.send(client, input.id, input.frame);
    }
    if (method === "events_close") {
      const input = desktopEventsRequests.events_close.parse(raw);
      return this.api.events.close(client, input.id);
    }
    if (method === "browser_login_start") {
      const input = desktopLoginRequests[method].parse(raw);
      return this.browserLogin.start(input, client, signal);
    }
    if (method === "browser_login_wait")
      return this.browserLogin.wait(desktopLoginRequests[method].parse(raw).id, client, signal);
    if (method === "browser_login_cancel")
      return this.browserLogin.cancel(desktopLoginRequests[method].parse(raw).id, client);
    if (method === "local_request") {
      const input = z
        .strictObject({ method: z.literal("runtime.info"), params: localParams["runtime.info"] })
        .parse(raw);
      return localResults[input.method].parse(
        await this.host.request(input.method, input.params, client, signal),
      );
    }
    if (method === "api_cancel") {
      const { id } = z.strictObject({ id: z.uuid() }).parse(raw);
      return this.api.cancel(client, id);
    }
    if (method === "api_fetch") {
      const input = z.object({ path: z.string() }).parse(raw);
      const path = new URL(input.path, this.origin).pathname;
      if (sessionMutations.has(path)) {
        this.browserLogin.cancel();
        this.httpScope.abort();
        this.httpScope = new AbortController();
        if (path === "/api/auth/sign-out") await this.select(null, client, signal);
        else this.deselect();
      }
      return this.api.request(raw, client, AbortSignal.any([signal, this.httpScope.signal]));
    }
    if (method === "control_session") {
      const input = z.strictObject({ accountId: accountId.nullable() }).parse(raw);
      return this.select(input.accountId, client, signal);
    }
    throw new LocalError("METHOD_NOT_PERMITTED", "Desktop method is not permitted");
  }
  close() {
    this.api.events.closeAll();
    this.browserLogin.cancel();
    this.selection.abort();
    this.httpScope.abort();
  }
}
