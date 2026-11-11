import { z } from "zod";
import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { relayRequestSchema, type RelayCommand } from "@raypx/contracts/tasks";
import { LocalError } from "../../../errors.js";
import type { LocalDatabase } from "../../../sqlite/index.js";
import { storedRecord } from "../../../sqlite/records.js";
import { commands, receipts } from "../../../sqlite/schema.js";

type CommandResult = { ok: true; value: unknown } | { ok: false; code: string };

const commandPayloadSchema = z.object({ request: relayRequestSchema });
const commandResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({ ok: z.literal(false), code: z.string() }),
]);
const forgottenCommand = (payload: string) =>
  JSON.stringify({ forgotten: createHash("sha256").update(payload).digest("hex") });
const forgottenResult = JSON.stringify({ ok: false, code: "NOT_FOUND" });

/** Idempotency for relay commands and local creation receipts. */
export class CommandReceipts {
  constructor(private readonly database: LocalDatabase) {}

  seen(id: string) {
    return Boolean(
      this.database.select({ id: receipts.id }).from(receipts).where(eq(receipts.id, id)).get(),
    );
  }
  receipt(id: string) {
    this.database.insert(receipts).values({ id }).onConflictDoNothing().run();
  }
  /** Returns a stored result for a retry, or null after reserving a new command. */
  reserve(binding: string, command: RelayCommand): CommandResult | null {
    const payload = JSON.stringify({
      binding,
      request: command.request,
      ...(command.context ? { context: command.context } : {}),
    });
    const old = this.database
      .select({ payload: commands.payload, result: commands.result })
      .from(commands)
      .where(eq(commands.id, command.id))
      .get();
    if (old) {
      if (old.payload !== payload && old.payload !== forgottenCommand(payload))
        throw new LocalError("IDEMPOTENCY_CONFLICT", "Command identity changed");
      return old.result ? storedRecord(commandResultSchema, old.result) : null;
    }
    this.database.insert(commands).values({ id: command.id, payload, result: null }).run();
    return null;
  }
  complete(id: string, result: CommandResult) {
    // A completion racing an explicit clear must not restore a private result.
    this.database
      .update(commands)
      .set({ result: JSON.stringify(result) })
      .where(and(eq(commands.id, id), isNull(sql`json_extract(${commands.payload},'$.forgotten')`)))
      .run();
  }
  /** Saved commands for one binding, decoded so history clearing can match their tasks. */
  saved(binding: string) {
    return this.database
      .select({ id: commands.id, payload: commands.payload })
      .from(commands)
      .where(eq(sql`json_extract(${commands.payload},'$.binding')`, binding))
      .all()
      .map((row) => ({ ...row, request: storedRecord(commandPayloadSchema, row.payload).request }));
  }
  /** Keep only a digest, so a retry stays idempotent without retaining private input. */
  forget(id: string, payload: string) {
    this.database
      .update(commands)
      .set({ payload: forgottenCommand(payload), result: forgottenResult })
      .where(eq(commands.id, id))
      .run();
  }
}
