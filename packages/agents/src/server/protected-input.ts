import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  protectedInputRequests as requests,
  conversationRuns as runs,
  conversationCounters as counters,
  conversationEvents as events,
  spaces,
  spaceMembers,
} from "@raypx/database/schema";
import {
  protectedInputAnswerSchema,
  protectedInputParts,
  protectedInputRequestSchema,
  type ProtectedInputRequest,
} from "@raypx/core/protected-input";
import { SpaceNotFound } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type { ExecutionRun } from "../conversations.js";
import type { PreparedComputerCall } from "../computer-tools.js";
import {
  ProtectedInputError,
  scrubProtectedOutput,
  type ProtectedInputCipher,
  type ProtectedInputsService,
} from "../protected-input.js";
import { assertRunFence } from "./fence.js";
import { publishConversationNotice } from "./conversations.js";

type Transaction = Pick<Database, "select" | "insert" | "update" | "execute">;
type Row = typeof requests.$inferSelect;
const erased = { ciphertext: null, wrappedDataKey: null, keyId: null };
function view(row: Row): ProtectedInputRequest {
  // Explicit projection: sealed envelopes can never be returned by accident.
  return protectedInputRequestSchema.parse({
    id: row.id,
    spaceId: row.spaceId,
    conversationId: row.conversationId,
    runId: row.runId,
    memberAccountId: row.memberAccountId,
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    target: row.target,
    input: row.input,
    untrustedInput: row.untrustedInput,
    provenanceKind: row.provenanceKind,
    state: row.state,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  });
}
function binding(row: Row) {
  return JSON.stringify([row.spaceId, row.runId, row.id, row.memberAccountId, row.callHash]);
}
async function callHash(call: PreparedComputerCall) {
  function ordered(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, ordered((value as Record<string, unknown>)[key])]),
      );
    return value;
  }
  return Buffer.from(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify(ordered([call.name, call.arguments, call.device ?? null])),
      ),
    ),
  ).toString("hex");
}
function selection(spaceId: string, id: string) {
  return and(eq(requests.spaceId, spaceId), eq(requests.id, id));
}
async function lock(tx: Transaction, row: Pick<Row, "spaceId" | "conversationId" | "runId">) {
  await tx
    .select()
    .from(counters)
    .where(and(eq(counters.spaceId, row.spaceId), eq(counters.conversationId, row.conversationId)))
    .for("update");
  const [run] = await tx
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.spaceId, row.spaceId),
        eq(runs.id, row.runId),
        eq(runs.conversationId, row.conversationId),
      ),
    )
    .for("update");
  if (!run) throw new ProtectedInputError("NOT_FOUND");
  return run;
}
async function admit(tx: Transaction, scope: SpaceScope) {
  const [member] = await tx
    .select({ id: spaceMembers.accountId })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
    .where(
      and(
        eq(spaceMembers.spaceId, scope.spaceId),
        eq(spaceMembers.accountId, scope.member.accountId),
        isNull(spaceMembers.removedAt),
        isNull(spaces.deletionClaimedAt),
      ),
    )
    .for("share", { of: spaces });
  if (!member) throw new SpaceNotFound();
}
async function transition(tx: Transaction, row: Row, state: "waiting" | "running") {
  const [run] = await tx
    .update(runs)
    .set({ state, computerInputPaused: false })
    .where(
      and(
        eq(runs.spaceId, row.spaceId),
        eq(runs.id, row.runId),
        inArray(runs.state, ["running", "waiting"]),
      ),
    )
    .returning();
  if (!run) return;
  const [counter] = await tx
    .select()
    .from(counters)
    .where(and(eq(counters.spaceId, row.spaceId), eq(counters.conversationId, row.conversationId)));
  if (!counter) throw new Error("MISSING_CONVERSATION_COUNTER");
  const sequence = counter.sequence + 1;
  await tx.insert(events).values({
    spaceId: row.spaceId,
    conversationId: row.conversationId,
    runId: row.runId,
    fence: run.fence,
    sequence,
    kind: "run.state",
    data: { state, failureCode: null, computerInputPaused: false },
  });
  await tx
    .update(counters)
    .set({ sequence })
    .where(and(eq(counters.spaceId, row.spaceId), eq(counters.conversationId, row.conversationId)));
  await publishConversationNotice(tx, { conversationId: row.conversationId, sequence });
}

/** Pure construction. Only wait/answer/consume and worker cleanup perform I/O. */
export function createProtectedInputsService(
  db: Database,
  cipher: ProtectedInputCipher,
  options: { now?: () => Date; ttlMs?: number; pollMs?: number } = {},
): ProtectedInputsService {
  const now = options.now ?? (() => new Date());
  const ttlMs = options.ttlMs ?? 600_000;
  const pollMs = options.pollMs ?? 100;
  if (![ttlMs, pollMs].every((n) => Number.isSafeInteger(n) && n > 0) || ttlMs > 86_400_000)
    throw new RangeError("INVALID_PROTECTED_INPUT_TIMING");
  async function current(tx: Transaction, spaceId: string, id: string) {
    const [row] = await tx.select().from(requests).where(selection(spaceId, id)).for("update");
    if (!row) throw new ProtectedInputError("NOT_FOUND");
    // Steering can change provenance while the member is looking at the form.
    const [active] = await tx
      .select({ untrustedInput: runs.untrustedInput, provenance: runs.inboundProvenance })
      .from(runs)
      .where(and(eq(runs.spaceId, spaceId), eq(runs.id, row.runId)));
    if (!row.untrustedInput && (active?.untrustedInput || active?.provenance)) {
      row.untrustedInput = true;
      row.provenanceKind = active.provenance?.kind ?? row.provenanceKind;
      await tx
        .update(requests)
        .set({ untrustedInput: true, provenanceKind: row.provenanceKind })
        .where(selection(spaceId, id));
    }
    if (["pending", "answered"].includes(row.state) && row.expiresAt <= now()) {
      const [expired] = await tx
        .update(requests)
        .set({ state: "expired", ...erased, resolvedAt: now() })
        .where(selection(spaceId, id))
        .returning();
      await transition(tx, expired!, "running");
      return expired!;
    }
    return row;
  }
  async function findCall(
    tx: Transaction,
    scope: SpaceScope,
    run: ExecutionRun,
    call: PreparedComputerCall,
  ) {
    const [row] = await tx
      .select()
      .from(requests)
      .where(
        and(
          eq(requests.spaceId, scope.spaceId),
          eq(requests.runId, run.id),
          eq(requests.toolCallId, call.id),
        ),
      );
    if (
      !row ||
      row.callHash !== (await callHash(call)) ||
      row.memberAccountId !== run.memberAccountId
    )
      throw new ProtectedInputError("NOT_FOUND");
    return current(tx, scope.spaceId, row.id);
  }
  return {
    async cleanup() {
      const due = await db
        .select()
        .from(requests)
        .where(
          and(inArray(requests.state, ["pending", "answered"]), lte(requests.expiresAt, now())),
        )
        .orderBy(asc(requests.expiresAt))
        .limit(100);
      for (const row of due)
        await db.transaction(async (tx) => {
          await lock(tx, row);
          await current(tx, row.spaceId, row.id);
        });
    },
    async pending(scope) {
      await admit(db, scope);
      const rows = await db
        .select()
        .from(requests)
        .where(
          and(
            eq(requests.spaceId, scope.spaceId),
            eq(requests.memberAccountId, scope.member.accountId),
            inArray(requests.state, ["pending", "answered"]),
          ),
        )
        .orderBy(asc(requests.createdAt))
        .limit(100);
      const result: ProtectedInputRequest[] = [];
      for (const row of rows) {
        const saved = await db.transaction(async (tx) => {
          await admit(tx, scope);
          await lock(tx, row);
          return current(tx, row.spaceId, row.id);
        });
        if (saved.state === "pending" || saved.state === "answered") result.push(view(saved));
      }
      return result;
    },
    async answer(scope, id, input) {
      // Never let a validation error carry the submitted value.
      const answer = protectedInputAnswerSchema.safeParse(input);
      if (!answer.success) throw new ProtectedInputError("INVALID_INPUT");
      return db
        .transaction(async (tx) => {
          await admit(tx, scope);
          const [found] = await tx
            .select()
            .from(requests)
            .where(
              and(
                selection(scope.spaceId, id),
                eq(requests.memberAccountId, scope.member.accountId),
              ),
            );
          if (!found) throw new ProtectedInputError("NOT_FOUND");
          const run = await lock(tx, found);
          const row = await current(tx, scope.spaceId, id);
          if (row.state !== "pending" || !["running", "waiting"].includes(run.state))
            return { error: true as const, row };
          let sealed = erased as {
            ciphertext: string | null;
            wrappedDataKey: string | null;
            keyId: string | null;
          };
          if (answer.data.decision === "answer") {
            try {
              const value = answer.data.value;
              const destination = view(row).input.destination;
              if (destination.kind.startsWith("http-") || destination.kind === "mcp-header") {
                if (/[\r\n]/.test(value)) throw new ProtectedInputError("INVALID_INPUT");
                if (
                  destination.kind === "http-basic" &&
                  (value.indexOf(":") < 1 || value.endsWith(":"))
                )
                  throw new ProtectedInputError("INVALID_INPUT");
              }
              sealed = await cipher.seal(binding(row), value);
            } catch {
              throw new ProtectedInputError("UNAVAILABLE");
            }
          }
          const [saved] = await tx
            .update(requests)
            .set({
              state: answer.data.decision === "answer" ? "answered" : "declined",
              ...sealed,
              resolvedAt: now(),
            })
            .where(selection(scope.spaceId, id))
            .returning();
          await transition(tx, saved!, "running");
          return { error: false as const, row: saved! };
        })
        .then((result) => {
          if (result.error)
            throw new ProtectedInputError(result.row.state === "expired" ? "EXPIRED" : "RESOLVED");
          return view(result.row);
        });
    },
    async wait(scope, run, call, signal) {
      if (!call.protectedInput) throw new ProtectedInputError("INVALID_INPUT");
      let row = await db.transaction(async (tx) => {
        await admit(tx, scope);
        await lock(tx, { spaceId: run.spaceId, conversationId: run.conversationId, runId: run.id });
        const active = await assertRunFence(tx, scope, run);
        const [existing] = await tx
          .select()
          .from(requests)
          .where(
            and(
              eq(requests.spaceId, scope.spaceId),
              eq(requests.runId, run.id),
              eq(requests.toolCallId, call.id),
            ),
          );
        if (existing) return findCall(tx, scope, run, call);
        const [created] = await tx
          .insert(requests)
          .values({
            spaceId: scope.spaceId,
            conversationId: run.conversationId,
            runId: run.id,
            id: crypto.randomUUID(),
            memberAccountId: run.memberAccountId,
            toolCallId: call.id,
            toolName: call.name,
            callHash: await callHash(call),
            target: call.device
              ? `${call.device.name} · ${call.device.directory} · ${call.target}`.slice(0, 1024)
              : call.target,
            input: call.protectedInput!,
            untrustedInput:
              active.untrustedInput ||
              run.untrustedInput === true ||
              active.inboundProvenance !== null,
            provenanceKind: run.inboundProvenance?.kind ?? null,
            createdAt: now(),
            expiresAt: new Date(now().getTime() + ttlMs),
          })
          .returning();
        await transition(tx, created!, "waiting");
        return created!;
      });
      while (row.state === "pending" && !signal.aborted) {
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
          };
          const timer = setTimeout(done, pollMs);
          signal.addEventListener("abort", done, { once: true });
          if (signal.aborted) done();
        });
        if (signal.aborted) break;
        row = await db.transaction(async (tx) => {
          await lock(tx, row);
          await assertRunFence(tx, scope, run);
          return current(tx, scope.spaceId, row.id);
        });
      }
      return signal.aborted ? "cancelled" : row.state;
    },
    async consume(scope, run, call, operation) {
      const sealed = await db.transaction(async (tx) => {
        await lock(tx, { spaceId: run.spaceId, conversationId: run.conversationId, runId: run.id });
        await assertRunFence(tx, scope, run);
        const row = await findCall(tx, scope, run, call);
        if (row.state !== "answered" || !row.ciphertext || !row.keyId || !row.wrappedDataKey)
          return null;
        // Commit deletion BEFORE external dispatch; a crash cannot consume twice.
        await tx
          .update(requests)
          .set({ state: "consumed", ...erased })
          .where(selection(scope.spaceId, row.id));
        return {
          binding: binding(row),
          ciphertext: row.ciphertext,
          wrappedDataKey: row.wrappedDataKey,
          keyId: row.keyId,
        };
      });
      if (!sealed)
        return JSON.stringify({
          untrusted: true,
          state: "failed",
          code: "PROTECTED_INPUT_UNAVAILABLE",
        });
      let value: string;
      try {
        value = await cipher.open(sealed.binding, sealed);
      } catch {
        throw new ProtectedInputError("UNAVAILABLE");
      }
      try {
        let output = await operation(value);
        for (const part of protectedInputParts(value, call.protectedInput))
          output = scrubProtectedOutput(output, part);
        return output;
      } catch {
        throw new ProtectedInputError("UNAVAILABLE");
      } finally {
        value = "";
      }
    },
  };
}
