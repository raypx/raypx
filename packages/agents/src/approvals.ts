import {
  approvalSettingsSchema,
  approvalSettingsStateSchema,
  MAX_TOOL_RESULT,
  type ApprovalMode,
  type ApprovalRequest,
  type ApprovalRule,
  type ApprovalSettings,
  type ApprovalSettingsState,
  type RevisionedApprovalSettings,
  type ToolName,
  type Effect,
  type EffectiveApprovalMode,
  type ApprovalReview,
  type ApprovalDevice,
} from "@raypx/core/approvals";
import type { RunId } from "@raypx/core/conversation";
import { StaleRunFenceError, type ExecutionRun } from "./conversations.js";
import type { SpaceScope } from "@raypx/spaces/server";
import { computerToolResult } from "./computer-tools.js";
import { EFFECT_INTENT_TIMEOUT_MS } from "./tool-limits.js";
import {
  autoReviewIneligibility,
  reviewApproval,
  REVIEW_RUN_BUDGET,
  type ApprovalReviewModels,
} from "./approval-reviewer.js";
export type { ApprovalReviewModel, ApprovalReviewModels } from "./approval-reviewer.js";

export class ApprovalOperationError extends Error {
  constructor(
    readonly code:
      | "MODE_UNAVAILABLE"
      | "NOT_FOUND"
      | "ALREADY_RESOLVED"
      | "NOT_ADDRESSED"
      | "EXPIRED"
      | "RULE_LIMIT",
  ) {
    super(code);
    this.name = "ApprovalOperationError";
  }
}
export class EffectUnknownError extends Error {
  readonly code = "EFFECT_UNKNOWN";
  constructor() {
    super("EFFECT_UNKNOWN");
    this.name = "EffectUnknownError";
  }
}
export class ApprovalSettingsConflictError extends Error {
  readonly code = "APPROVAL_SETTINGS_CONFLICT";
  constructor(readonly settings: RevisionedApprovalSettings) {
    super("APPROVAL_SETTINGS_CONFLICT");
    this.name = "ApprovalSettingsConflictError";
  }
}
/** A previous attempt may still have computer work in flight. Never infer or replay yet. */
export class EffectInProgressError extends Error {
  readonly code = "EFFECT_IN_PROGRESS";
  constructor(readonly retryAt: number) {
    super("EFFECT_IN_PROGRESS");
    this.name = "EffectInProgressError";
  }
}
/** Prepared by the one computer-tool definition, before policy or execution. */
export interface ApprovalCall {
  protectedInput?: import("@raypx/core/protected-input").ProtectedInputSpec;
  id: string;
  name: ToolName;
  arguments: Record<string, unknown>;
  argumentSummary: string;
  target: string;
  executable?: string;
  device?: ApprovalDevice;
  changes: boolean;
  readOnlyAnnotated?: boolean;
  readOnlyHttp?: boolean;
  /** Conservative argument provenance supplied by the executor, never the model. */
  argumentsUntrusted?: boolean;
}
export interface ApprovalSettingsInput {
  mode: ApprovalMode | "auto";
  rules: ApprovalRule[];
  expectedRevision: number;
}
export type ApprovalOutcome = "approved" | "denied" | "blocked" | "expired" | "cancelled";
export interface ApprovalAnswer {
  decision: "approved" | "denied";
  allowTool?: boolean;
}
export interface ApprovalsRepository {
  getEffectiveMode(
    scope: SpaceScope,
    defaultMode: ApprovalMode,
  ): Promise<Pick<EffectiveApprovalMode, "mode" | "source">>;
  getSettings(accountId: string, defaultMode: ApprovalMode): Promise<RevisionedApprovalSettings>;
  getRunSettings(
    scope: SpaceScope,
    actorAccountId: string,
    defaultMode: ApprovalMode,
  ): Promise<RevisionedApprovalSettings>;
  updateSettings(
    accountId: string,
    settings: ApprovalSettings,
    expectedRevision: number,
    defaultMode: ApprovalMode,
  ): Promise<RevisionedApprovalSettings>;
  listPending(scope: SpaceScope, now: Date): Promise<ApprovalRequest[]>;
  answer(
    scope: SpaceScope,
    id: string,
    answer: ApprovalAnswer,
    now: Date,
  ): Promise<ApprovalRequest>;
  createRequest(
    scope: SpaceScope,
    run: ExecutionRun,
    call: ApprovalCall,
    expiresAt: Date,
    createdAt: Date,
  ): Promise<ApprovalRequest>;
  pollRequest(
    scope: SpaceScope,
    run: ExecutionRun,
    id: string,
    now: Date,
  ): Promise<ApprovalRequest>;
  cancelRequest(scope: SpaceScope, run: ExecutionRun, id: string, now: Date): Promise<void>;
  claimReview?(
    scope: SpaceScope,
    run: ExecutionRun,
    id: string,
    modelId: string,
    effectKey: string,
    budget: number,
    now: Date,
  ): Promise<{
    claimed: boolean;
    request: ApprovalRequest;
    startedAt: string;
    fence: number;
    budgetExhausted: boolean;
  }>;
  completeReview?(
    scope: SpaceScope,
    run: ExecutionRun,
    id: string,
    review: ApprovalReview,
    now: Date,
  ): Promise<ApprovalRequest>;
  listEffects(
    scope: SpaceScope,
    runId: RunId,
    now: Date,
    execution?: ExecutionRun,
  ): Promise<Effect[]>;
  beginEffect(
    scope: SpaceScope,
    run: ExecutionRun,
    effect: Effect,
    now: Date,
  ): Promise<{ created: boolean; effect: Effect }>;
  completeEffect(
    scope: SpaceScope,
    key: string,
    state: "succeeded" | "failed" | "unknown",
    result: string | null,
    now: Date,
    run: ExecutionRun,
  ): Promise<void>;
}
export interface ApprovalsService {
  getEffectiveMode(scope: SpaceScope): Promise<EffectiveApprovalMode>;
  getSettings(accountId: string): Promise<ApprovalSettingsState>;
  updateSettings(accountId: string, input: ApprovalSettingsInput): Promise<ApprovalSettingsState>;
  listPending(scope: SpaceScope): Promise<ApprovalRequest[]>;
  answer(scope: SpaceScope, id: string, answer: ApprovalAnswer): Promise<ApprovalRequest>;
  authorize(
    scope: SpaceScope,
    run: ExecutionRun,
    call: ApprovalCall,
    signal: AbortSignal,
  ): Promise<ApprovalOutcome>;
  assertContinuable(scope: SpaceScope, run: ExecutionRun): Promise<void>;
  listEffects(scope: SpaceScope, runId: RunId): Promise<Effect[]>;
  executeEffect(
    scope: SpaceScope,
    run: ExecutionRun,
    call: ApprovalCall,
    operation: () => Promise<string>,
    signal: AbortSignal,
    gate?: (operation: () => Promise<string>) => Promise<string>,
  ): Promise<string>;
}
function matchingRule(rule: ApprovalRule, call: ApprovalCall) {
  if (rule.toolName !== call.name) return false;
  return rule.executable === (call.executable ?? null);
}
export function approvalDisposition(
  settings: { mode: ApprovalSettings["mode"] | "auto"; rules: ApprovalRule[] },
  call: ApprovalCall,
  untrustedInput = false,
): "approved" | "blocked" | "ask" {
  const rules = settings.rules.filter((rule) => matchingRule(rule, call));
  if (rules.some((rule) => rule.decision === "block")) return "blocked";
  // OS commands are never implicitly authorized by an account's broad mode.
  if (call.device && call.name === "computer_run_command") {
    if (untrustedInput || call.argumentsUntrusted) return "ask";
    return rules.some((rule) => rule.decision === "allow") ? "approved" : "ask";
  }
  if (call.name.startsWith("openapi_") && call.readOnlyHttp) return "approved";
  // Remote annotations are untrusted metadata. Only an exact Allow promotes
  // that annotated call to a read; all remote calls still record effects.
  if (
    call.name.startsWith("mcp_") &&
    call.readOnlyAnnotated &&
    rules.some((rule) => rule.decision === "allow")
  )
    return "approved";
  if (!call.changes || settings.mode === "never") return "approved";
  if (untrustedInput || call.argumentsUntrusted) return "ask";
  if (rules.some((rule) => rule.decision === "allow")) return "approved";
  return "ask";
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value && Object.getPrototypeOf(value) === Object.prototype)
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  throw new Error("INVALID_TOOL_ARGUMENTS");
}
async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function effectIdentity(run: ExecutionRun, call: ApprovalCall) {
  const argumentHash = await digest(canonicalJson(call.arguments));
  const key = await digest(canonicalJson([run.id, call.id, call.name, argumentHash]));
  return { key, argumentHash };
}
function boundedResult(value: string) {
  if (value.length <= MAX_TOOL_RESULT) return value;
  return computerToolResult("succeeded", value, true);
}
function failedResult(value: string) {
  try {
    const result: unknown = JSON.parse(value);
    return (
      typeof result === "object" &&
      result !== null &&
      "state" in result &&
      (result.state === "failed" || result.state === "cancelled")
    );
  } catch {
    return false;
  }
}
function pause(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });
  });
}
export function createApprovalsService(
  repository: ApprovalsRepository,
  options: {
    defaultMode?: ApprovalMode;
    requestTtlMs?: number;
    pollIntervalMs?: number;
    now?: () => Date;
    reviewModel?: ApprovalReviewModels;
    reviewTimeoutMs?: number;
  } = {},
): ApprovalsService {
  const defaultMode = options.defaultMode ?? "ask";
  const requestTtlMs = options.requestTtlMs ?? 600_000;
  const pollIntervalMs = options.pollIntervalMs ?? 100;
  const now = options.now ?? (() => new Date());
  const memberDeviceDecisions = new WeakMap<ApprovalCall, string>();
  if (![requestTtlMs, pollIntervalMs].every((value) => Number.isSafeInteger(value) && value > 0))
    throw new RangeError("Invalid approval timing");
  async function reviewAvailable() {
    try {
      return Boolean(await options.reviewModel?.available());
    } catch {
      return false;
    }
  }
  async function settingsState(value: RevisionedApprovalSettings): Promise<ApprovalSettingsState> {
    const available = await reviewAvailable();
    return approvalSettingsStateSchema.parse({
      ...value,
      availableModes: [
        { mode: "ask", available: true, reasonCode: null },
        { mode: "never", available: true, reasonCode: null },
        { mode: "auto", available, reasonCode: available ? null : "REVIEW_MODEL_NOT_CONFIGURED" },
      ],
    });
  }
  async function settings(accountId: string) {
    return settingsState(await repository.getSettings(accountId, defaultMode));
  }
  function runSettings(scope: SpaceScope, run: ExecutionRun) {
    return repository.getRunSettings(scope, run.memberAccountId, defaultMode);
  }
  async function assertContinuable(scope: SpaceScope, run: ExecutionRun) {
    const effects = await repository.listEffects(scope, run.id, now(), run);
    if (effects.some((effect) => effect.state === "unknown")) throw new EffectUnknownError();
    const pending = effects.find((effect) => effect.state === "intent");
    if (pending)
      throw new EffectInProgressError(Date.parse(pending.createdAt) + EFFECT_INTENT_TIMEOUT_MS);
  }
  return {
    async getEffectiveMode(scope) {
      const value = await repository.getEffectiveMode(scope, defaultMode);
      return {
        spaceId: scope.spaceId,
        ...value,
        availableModes: (await settingsState({ mode: value.mode, rules: [], revision: 0 }))
          .availableModes,
      };
    },
    getSettings: settings,
    async updateSettings(accountId, input) {
      if (input.mode === "auto" && !(await reviewAvailable()))
        throw new ApprovalOperationError("MODE_UNAVAILABLE");
      const value = approvalSettingsSchema.parse({ mode: input.mode, rules: input.rules });
      try {
        return settingsState(
          await repository.updateSettings(accountId, value, input.expectedRevision, defaultMode),
        );
      } catch (error) {
        if (error instanceof ApprovalSettingsConflictError)
          throw new ApprovalSettingsConflictError(await settingsState(error.settings));
        throw error;
      }
    },
    listPending: (scope) => repository.listPending(scope, now()),
    answer: (scope, id, answer) => repository.answer(scope, id, answer, now()),
    assertContinuable,
    listEffects: (scope, runId) => repository.listEffects(scope, runId, now()),
    async authorize(scope, run, call, signal) {
      if (signal.aborted) return "cancelled";
      // Refresh the attempt's authoritative provenance before any Allow shortcut.
      const effects = await repository.listEffects(scope, run.id, now(), run);
      const policy = await runSettings(scope, run);
      const action = approvalDisposition(
        policy,
        call,
        run.untrustedInput || Boolean(run.inboundProvenance),
      );
      if (action !== "ask") return action;
      let identity: Awaited<ReturnType<typeof effectIdentity>> | undefined;
      if (
        effects.some(
          (effect) =>
            effect.toolCallId === call.id &&
            effect.toolName === call.name &&
            (effect.state === "succeeded" || effect.state === "failed"),
        )
      ) {
        identity = await effectIdentity(run, call);
        if (
          effects.some(
            (effect) =>
              effect.key === identity!.key &&
              (effect.state === "succeeded" || effect.state === "failed"),
          )
        )
          return "approved";
      }
      const createdAt = now();
      const request = await repository.createRequest(
        scope,
        run,
        call,
        new Date(createdAt.getTime() + requestTtlMs),
        createdAt,
      );
      let current = request;
      if (
        policy.mode === "auto" &&
        current.state === "pending" &&
        !autoReviewIneligibility(run, call) &&
        options.reviewModel &&
        repository.claimReview &&
        repository.completeReview
      ) {
        let model;
        try {
          model = await options.reviewModel.resolve(scope);
        } catch {
          /* ask on resolution failure */
        }
        if (model && !signal.aborted) {
          identity ??= await effectIdentity(run, call);
          const claim = await repository.claimReview(
            scope,
            run,
            current.id,
            model.modelId,
            identity.key,
            REVIEW_RUN_BUDGET,
            now(),
          );
          current = claim.request;
          if (current.state === "pending" && !current.review && !claim.budgetExhausted) {
            let review: ApprovalReview;
            if (claim.claimed) {
              review = await reviewApproval(model, run, call, new Date(claim.startedAt), signal, {
                ...(options.reviewTimeoutMs === undefined
                  ? {}
                  : { timeoutMs: options.reviewTimeoutMs }),
                now,
              });
            } else {
              const completedAt = now();
              review = {
                modelId: model.modelId,
                verdict: "ask",
                reason: "An interrupted review requires a member decision.",
                startedAt: claim.startedAt,
                completedAt: completedAt.toISOString(),
                durationMs: Math.max(0, completedAt.getTime() - Date.parse(claim.startedAt)),
                fence: claim.fence,
              };
            }
            if (!signal.aborted)
              current = await repository.completeReview(scope, run, current.id, review, now());
          }
        }
      }
      while (current.state === "pending" && !signal.aborted) {
        await pause(
          Math.min(pollIntervalMs, Math.max(1, Date.parse(current.expiresAt) - now().getTime())),
          signal,
        );
        if (!signal.aborted) current = await repository.pollRequest(scope, run, request.id, now());
      }
      if (signal.aborted) {
        if (!["handover", "lease-lost", "timeout"].includes(signal.reason))
          await repository.cancelRequest(scope, run, request.id, now());
        return "cancelled";
      }
      // A member may have blocked the action while the request was open.
      if (
        current.state === "approved" &&
        approvalDisposition(
          await runSettings(scope, run),
          call,
          run.untrustedInput || Boolean(run.inboundProvenance),
        ) === "blocked"
      )
        return "blocked";
      if (current.state === "pending") throw new Error("INVALID_APPROVAL_STATE");
      if (
        call.device &&
        current.state === "approved" &&
        current.answeredByAccountId === run.memberAccountId
      ) {
        identity ??= await effectIdentity(run, call);
        memberDeviceDecisions.set(
          call,
          JSON.stringify([run.spaceId, run.id, run.fence, identity.key]),
        );
      }
      return current.state;
    },
    executeEffect: async function executeEffect(
      scope,
      run,
      call,
      operation,
      signal,
      gate,
    ): Promise<string> {
      if (signal.aborted) return computerToolResult("cancelled", "The action was cancelled.");
      const disposition = approvalDisposition(
        await runSettings(scope, run),
        call,
        run.untrustedInput || Boolean(run.inboundProvenance),
      );
      if (disposition === "blocked") return computerToolResult("refused", "BLOCKED");
      const { key, argumentHash } = await effectIdentity(run, call);
      if (gate) {
        const known = (await repository.listEffects(scope, run.id, now(), run)).find(
          (effect) => effect.key === key,
        );
        if (known?.state === "unknown") throw new EffectUnknownError();
        if (known?.state === "intent")
          throw new EffectInProgressError(Date.parse(known.createdAt) + EFFECT_INTENT_TIMEOUT_MS);
        if (known) return known.result ?? computerToolResult("failed", "TOOL_FAILED");
        return gate(() => executeEffect(scope, run, call, operation, signal, undefined));
      }
      if (
        call.device &&
        call.name === "computer_run_command" &&
        disposition !== "approved" &&
        memberDeviceDecisions.get(call) !== JSON.stringify([run.spaceId, run.id, run.fence, key])
      ) {
        const known = (await repository.listEffects(scope, run.id, now(), run)).find(
          (effect) => effect.key === key,
        );
        if (known?.state === "unknown") throw new EffectUnknownError();
        if (known?.state === "intent")
          throw new EffectInProgressError(Date.parse(known.createdAt) + EFFECT_INTENT_TIMEOUT_MS);
        if (known) return known.result ?? computerToolResult("failed", "TOOL_FAILED");
        // An Allow can disappear while queued for the Computer driver. Refuse
        // outside any effect intent rather than waiting for a card under its gate.
        return computerToolResult("refused", "APPROVAL_REQUIRED");
      }
      const intent: Effect = {
        spaceId: run.spaceId,
        conversationId: run.conversationId,
        key,
        runId: run.id,
        toolCallId: call.id,
        toolName: call.name,
        argumentHash,
        state: "intent",
        result: null,
        createdAt: now().toISOString(),
        completedAt: null,
      };
      const begun = await repository.beginEffect(scope, run, intent, now());
      if (!begun.created) {
        if (begun.effect.state === "unknown") throw new EffectUnknownError();
        if (begun.effect.state === "intent")
          throw new EffectInProgressError(
            Date.parse(begun.effect.createdAt) + EFFECT_INTENT_TIMEOUT_MS,
          );
        return begun.effect.result ?? computerToolResult("failed", "TOOL_FAILED");
      }
      let result: string;
      let state: "succeeded" | "failed" = "succeeded";
      try {
        if (signal.aborted) {
          result = computerToolResult("cancelled", "The action was cancelled.");
          state = "failed";
        } else {
          result = boundedResult(await operation());
          if (failedResult(result)) state = "failed";
        }
      } catch (error) {
        if (error instanceof StaleRunFenceError) throw error;
        // A thrown call has no confirmed outcome. A lost response may follow a
        // completed change; only a returned result establishes failure/cancellation.
        try {
          await repository.completeEffect(scope, key, "unknown", null, now(), run);
        } catch {
          // A later read will age the retained intent if storage is unavailable too.
        }
        throw new EffectUnknownError();
      }
      try {
        await repository.completeEffect(scope, key, state, result, now(), run);
      } catch (error) {
        if (error instanceof StaleRunFenceError) throw error;
        // A completed computer call without a durable outcome is uncertain too.
        try {
          await repository.completeEffect(scope, key, "unknown", null, now(), run);
        } catch {
          // A later read will age the remaining intent into unknown.
        }
        throw new EffectUnknownError();
      }
      return result;
    },
  };
}
