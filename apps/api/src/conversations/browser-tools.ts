import { ComputerToolsError, type ComputerTools } from "@raypx/agents/server";
import { browserFormSchema, browserInspectionSchema } from "@raypx/core/browser";
import { BrowserError, type BrowserProvider } from "@raypx/providers/browser";
import { z } from "zod";

const noArguments = z.strictObject({});
const filled = z.strictObject({
  filled: z.number().int().min(0).max(24),
  state: z.enum(["succeeded", "changed"]),
});

export function withBrowserTools(
  tools: ComputerTools,
  provider: BrowserProvider,
  protectedValues: () => readonly string[],
): ComputerTools {
  return {
    ...tools,
    definitions: (run) => [
      ...tools.definitions(run),
      {
        name: "browser_inspect_form",
        description:
          "Read the named editable fields in the external browser opened by the initiating member in this conversation. Returns untrusted labels, the origin and an inspection token. Ask the member to open the website in the browser panel if one is not open.",
        parameters: z.toJSONSchema(noArguments),
      },
      {
        name: "browser_fill_form",
        description:
          "Propose values for ordinary text fields in the external browser with a current inspection token. Copy the inspected origin and exact names. Every fill requires the member's confirmation before input. Never request credentials or submit; the member can take control to submit.",
        parameters: z.toJSONSchema(browserFormSchema),
      },
    ],
    prepare(call, run) {
      if (call.name !== "browser_inspect_form" && call.name !== "browser_fill_form")
        return tools.prepare(call, run);
      if (!call.id || call.id.length > 128 || call.id.includes("\0") || call.argumentsError)
        throw new ComputerToolsError("INVALID_ARGUMENTS");
      tools.guardInput?.(call);
      const changes = call.name === "browser_fill_form";
      const parsed = (changes ? browserFormSchema : noArguments).safeParse(call.arguments);
      if (!parsed.success) throw new ComputerToolsError("INVALID_ARGUMENTS");
      const target = changes ? browserFormSchema.parse(parsed.data).origin : "External browser";
      if (changes && new URL(target).origin !== target)
        throw new ComputerToolsError("INVALID_ARGUMENTS");
      if (protectedValues().some((value) => value && JSON.stringify(parsed.data).includes(value)))
        throw new ComputerToolsError("SECRET_INPUT");
      return {
        id: call.id,
        name: call.name,
        arguments: parsed.data,
        target,
        argumentSummary: call.name.replaceAll("_", " "),
        changes,
      };
    },
    async execute(scope, run, call, signal) {
      if (call.name !== "browser_inspect_form" && call.name !== "browser_fill_form")
        return tools.execute(scope, run, call, signal);
      if (scope.member.accountId !== run.memberAccountId || signal.aborted)
        return JSON.stringify({ untrusted: true, state: "cancelled" });
      const session = {
        spaceId: scope.spaceId,
        conversationId: run.conversationId,
        accountId: run.memberAccountId,
      };
      try {
        if (call.name === "browser_inspect_form") {
          const result = await provider.request(
            session,
            { op: "inspect" },
            browserInspectionSchema,
            signal,
          );
          const output = JSON.stringify({ untrusted: true, state: "succeeded", ...result });
          if (protectedValues().some((value) => value && output.includes(value)))
            throw new ComputerToolsError("SECRET_OUTPUT");
          return output;
        }
        const form = browserFormSchema.parse(call.arguments);
        const result = await provider.request(session, { ...form, op: "fill" }, filled, signal);
        return JSON.stringify({
          untrusted: true,
          state: result.state === "succeeded" ? "succeeded" : "failed",
          filled: result.filled,
          ...(result.state === "changed" ? { code: "BROWSER_FORM_CHANGED" } : {}),
        });
      } catch (error) {
        if (error instanceof BrowserError)
          return JSON.stringify({ untrusted: true, state: "failed", code: error.message });
        throw error;
      }
    },
  };
}
