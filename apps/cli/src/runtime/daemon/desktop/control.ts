import { desktopLoginRequests, desktopEventsRequests } from "@raypx/contracts/desktop";
import { BrowserLogin } from "./browser-login.js";
import { accountProfileSchema } from "@raypx/contracts/api";
import { localResults, type LocalClientMethod } from "@raypx/contracts/local-client";
import { localParams, type LocalMethod } from "@raypx/contracts/local";
import { hostAuthorizationSchema, controlInfoSchema } from "@raypx/contracts/terminal";
import { deviceGrantSchema } from "@raypx/contracts/tasks";
import { z } from "zod";
import { LocalError } from "../../errors.js";
import type { DesktopApi } from "./api.js";

export interface DesktopHost {
  request(
    method: LocalMethod,
    params: unknown,
    clientId: string,
    signal: AbortSignal,
  ): Promise<unknown>;
}
const accountId = z.string().min(1).max(200);
const accountInput = z.strictObject({ accountId });
const controlInputs = {
  control_info: accountInput,
  control_enable: accountInput.extend({ enabled: z.boolean() }),
  control_revoked: accountInput,
  terminal_settings: accountInput,
  terminal_configure: accountInput.extend({
    enabled: z.boolean(),
    rootIds: z.array(z.uuid()).max(200),
  }),
};
const controlMethods = {
  control_info: "host.info",
  control_enable: "host.enable",
  control_revoked: "host.revoked",
  terminal_settings: "host.terminal.settings",
  terminal_configure: "host.terminal.configure",
} as const satisfies Record<keyof typeof controlInputs, LocalMethod>;
/** Requests that replace or end the cookie session this control verified its account with. */
const sessionMutations = new Set([
  "/api/auth/sign-in/email",
  "/api/auth/sign-up/email",
  "/api/auth/sign-out",
]);
const unauthorized = () => new LocalError("AUTH_REQUIRED", "AUTH_REQUIRED");
export type ConnectorDirectories = z.infer<(typeof localParams)["connectors.status"]>["configDirs"];

/** Account and renderer policy. The native host supplies configuration, never account assertions. */
export class DesktopControl {
  private selection = new AbortController();
  private selected: string | null = null;
  private authorizationError = false;
  private httpScope = new AbortController();
  private readonly browserLogin: BrowserLogin;
  constructor(
    private readonly api: DesktopApi,
    private readonly host: DesktopHost,
    private readonly directories: ConnectorDirectories,
  ) {
    this.browserLogin = new BrowserLogin(api, host, () => {
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
    this.selected = null;
  }
  async select(account: string | null, client: string, parent: AbortSignal) {
    this.api.events.closeAll();
    this.selection.abort();
    const selection = new AbortController();
    this.selection = selection;
    const signal = AbortSignal.any([selection.signal, parent]);
    const previous = this.selected;
    this.selected = null;
    if (previous !== account) this.authorizationError = false;
    if (account === null || (previous !== null && previous !== account)) {
      await this.host.request(
        "host.session",
        { accountId: null, apiUrl: this.origin },
        client,
        signal,
      );
      signal.throwIfAborted();
    }
    if (account !== null) {
      await this.verify(account, signal);
      await this.host.request(
        "host.session",
        { accountId: account, apiUrl: this.origin },
        client,
        signal,
      );
      signal.throwIfAborted();
    }
    this.selected = account;
    return true;
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
      if (input.reauthorizeHost) {
        if (!this.selected) throw unauthorized();
        await this.verify(this.selected, signal);
      }
      return this.browserLogin.start(input, client, signal);
    }
    if (method === "browser_login_wait")
      return this.browserLogin.wait(desktopLoginRequests[method].parse(raw).id, client, signal);
    if (method === "browser_login_cancel")
      return this.browserLogin.cancel(desktopLoginRequests[method].parse(raw).id, client);
    if (method === "local_request") return this.localRequest(raw, client, signal);
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
        // Only an explicit sign-out revokes host access. Signing in must not: the daemon's
        // credential outlives a cookie session, and the account that results is verified
        // by the next `control_session`, which retires the binding if it differs.
        if (path === "/api/auth/sign-out") await this.select(null, client, signal);
        else this.deselect();
      }
      return this.api.request(raw, client, AbortSignal.any([signal, this.httpScope.signal]));
    }
    if (method === "control_session") {
      const input = z.strictObject({ accountId: accountId.nullable() }).parse(raw);
      return this.select(input.accountId, client, signal);
    }
    if (method === "control_detach") {
      z.strictObject({}).parse(raw);
      if (this.selected)
        await this.host.request(
          "host.detach",
          { accountId: this.selected, apiUrl: this.origin },
          client,
          signal,
        );
      return true;
    }
    if (method === "control_attach") {
      const input = z
        .strictObject({ accountId, apiUrl: z.string(), grant: deviceGrantSchema })
        .parse(raw);
      if (input.apiUrl !== this.origin) throw unauthorized();
      if (this.selected !== input.accountId) await this.select(input.accountId, client, signal);
      const selected = this.selection;
      const operation = AbortSignal.any([signal, selected.signal]);
      const info = controlInfoSchema.parse(
        await this.host.request(
          "host.info",
          { accountId: input.accountId, apiUrl: this.origin },
          client,
          operation,
        ),
      );
      if (
        info.authorized &&
        info.binding?.deviceId === input.grant.deviceId &&
        info.binding.epoch === input.grant.epoch
      )
        return info;
      await this.verify(input.accountId, operation);
      operation.throwIfAborted();
      // Once sent, consume the authorization response even if the page disappears,
      // so a credential issued during disconnect can be revoked instead of abandoned.
      const authorization = await this.api
        .rpc(
          "hosts.authorize",
          { deviceId: input.grant.deviceId, epoch: input.grant.epoch },
          AbortSignal.timeout(30_000),
        )
        .then(
          (value) => hostAuthorizationSchema.parse(value),
          (error: unknown) => {
            if (!operation.aborted && error instanceof LocalError && error.code === "AUTH_REQUIRED")
              this.authorizationError = true;
            throw error;
          },
        );
      try {
        operation.throwIfAborted();
        if (this.selected !== input.accountId) throw unauthorized();
        return controlInfoSchema.parse(
          await this.host.request(
            "host.authorize",
            { accountId: input.accountId, apiUrl: this.origin, authorization },
            client,
            operation,
          ),
        );
      } catch (error) {
        // An issued credential must be revoked even after its renderer/selection disappears.
        await this.api
          .rpc("hosts.revoke", { credential: authorization.credential }, AbortSignal.timeout(5000))
          .catch(() => {});
        throw error;
      }
    }
    if (Object.hasOwn(controlInputs, method)) {
      const key = method as keyof typeof controlInputs;
      const input = controlInputs[key].parse(raw);
      if (this.selected !== input.accountId) throw unauthorized();
      const operation = AbortSignal.any([signal, this.selection.signal]);
      if (key === "control_enable" || key === "terminal_configure")
        await this.verify(input.accountId, operation);
      const result = await this.host.request(
        controlMethods[key],
        { ...input, apiUrl: this.origin },
        client,
        operation,
      );
      if (key === "terminal_settings" || key === "terminal_configure")
        return z
          .object({ enabled: z.boolean(), rootIds: z.array(z.uuid()).max(200) })
          .parse(result);
      const info = controlInfoSchema.parse(result);
      if (info.authorized || info.connected) this.authorizationError = false;
      return key === "control_info" && this.authorizationError
        ? { ...info, error: "AUTH_REQUIRED" }
        : info;
    }
    throw new LocalError("METHOD_NOT_PERMITTED", "Desktop method is not permitted");
  }
  async localRequest(raw: unknown, client: string, signal: AbortSignal, host = this.host) {
    const input = z
      .strictObject({ method: z.string(), params: z.record(z.string(), z.unknown()) })
      .parse(raw);
    if (!Object.hasOwn(localResults, input.method))
      throw new LocalError("METHOD_NOT_PERMITTED", "Local method is not permitted");
    const method = input.method as LocalClientMethod;
    const params = { ...input.params };
    if (method === "instance.begin") params.origin = this.origin;
    if (method.startsWith("connectors.")) params.configDirs = this.directories;
    if (method === "connectors.install" && params.recoverModified === true)
      throw new LocalError("METHOD_NOT_PERMITTED", "Native connector recovery required");
    const parsed = localParams[method].parse(params);
    signal.throwIfAborted();
    return localResults[method].parse(await host.request(method, parsed, client, signal));
  }
  close() {
    this.api.events.closeAll();
    this.browserLogin.cancel();
    this.selection.abort();
    this.httpScope.abort();
  }
}
