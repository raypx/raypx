import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  approvalModeInputSchema,
  approvalRuleSchema,
  approvalSettingsStateSchema,
  approvalRequestSchema,
  effectSchema,
  effectiveApprovalModeSchema,
} from "@raypx/core/approvals";
import { runIdSchema } from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";

const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
const selection = z.strictObject({ spaceId: spaceIdSchema });
export const agentApprovalsContract = {
  pending: session.input(selection).output(z.array(approvalRequestSchema).max(100)),
  answer: session
    .input(
      selection.extend({
        requestId: approvalRequestSchema.shape.id,
        decision: z.enum(["approved", "denied"]),
        allowTool: z.boolean().optional(),
      }),
    )
    .output(approvalRequestSchema),
  settings: session.input(z.strictObject({})).output(approvalSettingsStateSchema),
  effectiveMode: session.input(selection).output(effectiveApprovalModeSchema),
  updateSettings: session
    .input(
      z.strictObject({
        mode: approvalModeInputSchema,
        rules: z.array(approvalRuleSchema).max(256),
        expectedRevision: z.number().int().nonnegative(),
      }),
    )
    .output(approvalSettingsStateSchema),
  effects: session
    .input(selection.extend({ runId: runIdSchema }))
    .output(z.array(effectSchema).max(512)),
};
