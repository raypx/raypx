import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditEntry } from "@raypx/contracts/api";

export type AuditIntent = Pick<AuditEntry, "action" | "actorId" | "source" | "requestId">;
export interface AuditOperation extends AuditIntent {
  id: string;
  mutationStarted: boolean;
  committed: boolean;
  finalized: boolean;
  auditUnavailable?: boolean;
}
export interface AuditJournal {
  begin(intent: AuditIntent): Promise<string>;
  finish(id: string, outcome: "failed" | "rejected", errorCode: string): Promise<void>;
}
export class AuditUnavailable extends Error {
  constructor() {
    super("AUDIT_UNAVAILABLE");
  }
}
const errorCode = (error: unknown) => {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  return typeof code === "string" &&
    [
      "FORBIDDEN",
      "UNAUTHORIZED",
      "INVALID_INPUT",
      "CONFIGURATION_CONFLICT",
      "CONFIGURATION_UNAVAILABLE",
    ].includes(code)
    ? code
    : "OPERATION_FAILED";
};
export class AuditService {
  private readonly context = new AsyncLocalStorage<AuditOperation>();
  constructor(private readonly journal: AuditJournal) {}
  current() {
    return this.context.getStore();
  }
  async run<T>(intent: AuditIntent, operation: () => Promise<T>): Promise<T> {
    const parent = this.current();
    if (parent) {
      if (parent.action !== intent.action || parent.actorId !== intent.actorId)
        throw new AuditUnavailable();
      return operation();
    }
    let id: string;
    try {
      id = await this.journal.begin(intent);
    } catch {
      throw new AuditUnavailable();
    }
    const scope: AuditOperation = {
      ...intent,
      id,
      mutationStarted: false,
      committed: false,
      finalized: false,
    };
    return this.context.run(scope, async () => {
      try {
        const result = await operation();
        if (scope.auditUnavailable && !scope.committed) throw new AuditUnavailable();
        if (result instanceof Response && result.status >= 400) {
          // A timeout may return before a database transaction finishes. Never invent a rollback.
          if (!scope.mutationStarted || result.status < 500)
            await this.fail(
              result.status === 401 || result.status === 403 ? "rejected" : "failed",
              `HTTP_${result.status}`,
            );
        } else if (!scope.committed && !scope.finalized) throw new AuditUnavailable();
        return result;
      } catch (error) {
        if (!scope.committed)
          await this.fail(
            errorCode(error) === "FORBIDDEN" || errorCode(error) === "UNAUTHORIZED"
              ? "rejected"
              : "failed",
            errorCode(error),
          );
        throw scope.auditUnavailable ? new AuditUnavailable() : error;
      }
    });
  }
  async fail(outcome: "failed" | "rejected", code: string) {
    const scope = this.current();
    if (scope && !scope.committed) {
      // Failure to finalize leaves the durable intent visible as unknown, never as success.
      await this.journal.finish(scope.id, outcome, code).then(
        () => {
          scope.finalized = true;
        },
        () => {},
      );
    }
  }
}
