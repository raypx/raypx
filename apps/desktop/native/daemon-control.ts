import type { ControlInfo } from "@raypx/host";
import type { DeviceGrant } from "@raypx/contracts/tasks";
import { isMissingProcedure, type ApiClient } from "@raypx/client";
import type { LocalEngine } from "./engine";

/** Native bootstraps a restricted device credential; it never owns or renews it. */
export class DaemonControlProxy {
  private accountId: string | null = null;
  private generation = 0;
  private authorizationError: "AUTH_REQUIRED" | undefined;
  private selecting = Promise.resolve();
  constructor(
    private readonly engine: Pick<LocalEngine, "request">,
    private readonly apiUrl: string,
    private readonly api: Pick<ApiClient, "account" | "hosts">,
  ) {}
  async session(accountId: string | null) {
    const generation = ++this.generation;
    const operation = this.selecting.then(async () => {
      if (generation !== this.generation) return false;
      if (accountId) {
        const profile = await this.api.account.get({});
        if (profile.id !== accountId) throw new Error("AUTH_REQUIRED");
      }
      if (generation !== this.generation) return false;
      await this.engine.request("host.session", { accountId, apiUrl: this.apiUrl });
      if (this.accountId !== accountId) this.authorizationError = undefined;
      this.accountId = accountId;
      return true;
    });
    this.selecting = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }
  async info(accountId: string): Promise<ControlInfo> {
    const info = (await this.engine.request("host.info", {
      accountId,
      apiUrl: this.apiUrl,
    })) as ControlInfo;
    if (info.authorized || info.connected) this.authorizationError = undefined;
    return this.authorizationError ? { ...info, error: this.authorizationError } : info;
  }
  enable(accountId: string, enabled: boolean) {
    return this.engine.request("host.enable", {
      accountId,
      apiUrl: this.apiUrl,
      enabled,
    }) as Promise<ControlInfo>;
  }
  revoked(accountId: string) {
    return this.engine.request("host.revoked", {
      accountId,
      apiUrl: this.apiUrl,
    }) as Promise<ControlInfo>;
  }
  async attach(accountId: string, apiUrl: string, grant: DeviceGrant) {
    if (this.accountId !== accountId) await this.session(accountId);
    const generation = this.generation;
    if (this.accountId !== accountId) throw new Error("AUTH_REQUIRED");
    if (apiUrl !== this.apiUrl) throw new Error("Unexpected remote API origin");
    const info = await this.info(accountId);
    if (
      info.authorized &&
      info.binding?.deviceId === grant.deviceId &&
      info.binding.epoch === grant.epoch
    )
      return info;
    const profile = await this.api.account.get({});
    if (profile.id !== accountId) throw new Error("AUTH_REQUIRED");
    let authorization;
    try {
      authorization = await this.api.hosts.authorize({
        deviceId: grant.deviceId,
        epoch: grant.epoch,
      });
    } catch (error) {
      if (isMissingProcedure(error)) {
        if (generation !== this.generation || this.accountId !== accountId)
          throw new Error("AUTH_REQUIRED", { cause: error });
        return this.engine.request("host.legacy", {
          accountId,
          apiUrl: this.apiUrl,
          grant,
        }) as Promise<ControlInfo>;
      }
      if (error && typeof error === "object" && "code" in error && error.code === "UNAUTHORIZED")
        this.authorizationError = "AUTH_REQUIRED";
      throw error;
    }
    this.authorizationError = undefined;
    if (generation !== this.generation || this.accountId !== accountId) {
      await this.api.hosts.revoke({ credential: authorization.credential }).catch(() => {});
      throw new Error("AUTH_REQUIRED");
    }
    return (await this.engine.request("host.authorize", {
      accountId,
      apiUrl: this.apiUrl,
      authorization,
    })) as ControlInfo;
  }
  async detach() {
    if (this.accountId)
      await this.engine.request("host.detach", { accountId: this.accountId, apiUrl: this.apiUrl });
  }
  async terminalSettings(accountId: string) {
    await this.selecting;
    return this.engine.request("host.terminal.settings", {
      accountId,
      apiUrl: this.apiUrl,
    }) as Promise<{ enabled: boolean; rootIds: string[] }>;
  }
  async terminalConfigure(accountId: string, value: { enabled: boolean; rootIds: string[] }) {
    await this.selecting;
    return this.engine.request("host.terminal.configure", {
      accountId,
      apiUrl: this.apiUrl,
      ...value,
    }) as Promise<{ enabled: boolean; rootIds: string[] }>;
  }
  wake() {
    return Promise.resolve();
  }
  async refreshGrant() {
    return this.accountId
      ? ((await this.engine.request("host.refresh", {
          accountId: this.accountId,
          apiUrl: this.apiUrl,
        })) as boolean)
      : false;
  }
}
