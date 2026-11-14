import { toolPageSchema, type ToolOutcome, type ToolPage } from "@raypx/core/conversation";
import type { ToolCompletion } from "./conversations.js";

export function toolCompletion(
  toolCallId: string,
  output: string | null,
  fallback: ToolOutcome = "unknown",
  toolName?: string,
): ToolCompletion {
  let outcome = fallback;
  let exitStatus: number | null = null;
  let page: ToolPage | undefined;
  try {
    const result = JSON.parse(output ?? "null") as {
      state?: unknown;
      content?: unknown;
      exitStatus?: unknown;
      pageId?: unknown;
      version?: unknown;
    } | null;
    if (
      result?.state === "succeeded" ||
      result?.state === "failed" ||
      result?.state === "cancelled"
    )
      outcome = result.state;
    if (
      result?.state === "refused" ||
      result?.state === "blocked" ||
      result?.state === "denied" ||
      result?.state === "expired"
    )
      outcome = "refused";
    if (Number.isInteger(result?.exitStatus)) exitStatus = result!.exitStatus as number;
    // This is the server operation's returned value, never model-supplied arguments.
    if (
      outcome === "succeeded" &&
      (toolName === "agent_page_create" || toolName === "agent_page_update")
    ) {
      const parsed = toolPageSchema.safeParse({ id: result?.pageId, version: result?.version });
      if (parsed.success) page = parsed.data;
    }
    if (exitStatus === null && typeof result?.content === "string") {
      const content: unknown = JSON.parse(result.content);
      if (
        typeof content === "object" &&
        content !== null &&
        "exitStatus" in content &&
        Number.isInteger(content.exitStatus)
      )
        exitStatus = content.exitStatus as number;
    }
  } catch {
    /* Provider text is never copied into lifecycle metadata. */
  }
  return { toolCallId, outcome, exitStatus, ...(page ? { page } : {}) };
}
