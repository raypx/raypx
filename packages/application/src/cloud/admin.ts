import { cloudPage } from "./pagination.js";
import { type CloudRunStatus } from "@voidmix/core";
import type { CloudContext, Actor } from "./context.js";

export function cloudAdmin(context: CloudContext) {
  const { repo, required, usageFor, requireAdmin, adminSummary } = context;
  return {
    adminListRuns: (
      input: Actor & {
        status?: CloudRunStatus;
        accountId?: string;
        limit?: number;
        cursor?: string;
      },
    ) =>
      repo.read(async (tx) => {
        await requireAdmin(tx, input.actorId);
        const page = await cloudPage(tx, input, "runs", {
          ...(input.status ? { status: input.status } : {}),
          ...(input.accountId
            ? {
                ownerAccountId: input.accountId.includes(":")
                  ? input.accountId
                  : `user:${input.accountId}`,
              }
            : {}),
        });
        return { items: page.items.map(adminSummary), nextCursor: page.nextCursor };
      }),
    adminInspectRun: (input: Actor & { runId: string }) =>
      repo.read(async (tx) => {
        await requireAdmin(tx, input.actorId);
        const run = required(await tx.get("runs", input.runId));
        const calls = await tx.list("usage", { parentId: run.id });
        return {
          run: adminSummary(run),
          usage: {
            calls: calls.filter((c) => c.state !== "released").length,
            inputTokens: calls.reduce((n, c) => n + (c.inputTokens ?? 0), 0),
            outputTokens: calls.reduce((n, c) => n + (c.outputTokens ?? 0), 0),
            unknownCalls: calls.filter((c) => c.state === "unknown").length,
            estimatedCost: calls.reduce((n, c) => n + (c.estimatedCost ?? 0), 0),
          },
        };
      }),
    adminUsage: (input: Actor & { accountId: string }) =>
      repo.read(async (tx) => {
        await requireAdmin(tx, input.actorId);
        return usageFor(tx, input.accountId);
      }),
  };
}
