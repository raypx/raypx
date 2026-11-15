import type { SetupStatus } from "@raypx/contracts/api";
import { hasPermission, type AccountAccess } from "../access.js";

export interface SetupChecklistPort {
  access(options: { signal: AbortSignal }): Promise<AccountAccess>;
  status(options: { signal: AbortSignal }): Promise<SetupStatus>;
}
export interface SetupPreferenceStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
}
export type SetupChecklistState =
  | { status: "hidden" }
  | { status: "ready"; configuration: SetupStatus }
  | { status: "unavailable" };

export function setupDismissalKey(origin: string, accountId: string) {
  return `raypx:setup-dismissed:v1:${JSON.stringify([origin, accountId])}`;
}

/** Only dismissal is device state. Configuration and authority are always read afresh. */
export class SetupChecklistController {
  private state: SetupChecklistState = { status: "hidden" };
  private listeners = new Set<() => void>();
  private pending: AbortController | undefined;
  private dismissed = false;
  private readonly key: string;
  constructor(
    private readonly port: SetupChecklistPort,
    origin: string,
    private readonly accountId: string,
    private readonly preferences: SetupPreferenceStore,
  ) {
    this.key = setupDismissalKey(origin, accountId);
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: SetupChecklistState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  async refresh() {
    this.pending?.abort();
    const request = new AbortController();
    this.pending = request;
    let admitted = false;
    try {
      try {
        this.dismissed ||= this.preferences.read(this.key) === "true";
      } catch {
        /* Blocked device storage keeps the current in-memory preference. */
      }
      if (this.dismissed) {
        this.publish({ status: "hidden" });
        return;
      }
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
      const access = await this.port.access({ signal });
      if (request.signal.aborted) return;
      if (access.accountId !== this.accountId || !hasPermission(access, "configuration.read")) {
        this.publish({ status: "hidden" });
        return;
      }
      admitted = true;
      const configuration = await this.port.status({ signal });
      if (request.signal.aborted) return;
      this.publish(
        configuration.model && configuration.sandbox && configuration.mail
          ? { status: "hidden" }
          : { status: "ready", configuration },
      );
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      const denied = code === "FORBIDDEN" || code === "UNAUTHORIZED";
      if (!request.signal.aborted)
        this.publish({ status: admitted && !denied ? "unavailable" : "hidden" });
    }
  }
  dismiss() {
    this.dismissed = true;
    this.pending?.abort();
    try {
      this.preferences.write(this.key, "true");
    } catch {
      /* Keep the in-memory choice. */
    }
    this.publish({ status: "hidden" });
  }
  dispose() {
    this.pending?.abort();
  }
}
