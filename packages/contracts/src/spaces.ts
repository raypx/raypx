import {
  MAX_COMPUTER_DIRECTORY_ENTRIES,
  MAX_COMPUTER_FILE_BYTES,
  computerDirectorySchema,
  computerFileSchema,
  computerFilePathSchema,
  spaceComputerSchema,
  deviceComputerSelectionSchema,
} from "@raypx/core/computers";
import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  spaceIdSchema,
  spaceSchema,
  spaceMemberSchema,
  spaceInputSchema,
  spaceRoleSchema,
  spaceDirectoryMemberSchema,
  spaceInvitationSchema,
  issuedSpaceInvitationSchema,
  spaceInvitationPreviewSchema,
  spaceInvitationAcceptanceSchema,
  spaceSettingsSchema,
  spaceAuditPageSchema,
  spaceMemberRemovalSchema,
  spaceEventSchema,
} from "@raypx/core/spaces";
import { approvalModeInputSchema } from "@raypx/core/approvals";
import {
  agentIdSchema,
  agentInputSchema,
  agentSchema,
  conversationSchema,
} from "@raypx/core/agents";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";
import { computerScreenContract } from "./computer-screen.js";

const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
const membership = z.strictObject({ space: spaceSchema, member: spaceMemberSchema });
const agentConversation = z.strictObject({ agent: agentSchema, conversation: conversationSchema });
// spaceId selects a resource. Only a freshly resolved session/member row grants its scope.
const spaceSelection = z.strictObject({ spaceId: spaceIdSchema });
const agentSelection = spaceSelection.extend({ id: agentIdSchema });
const memberSelection = spaceSelection.extend({ accountId: z.string().min(1).max(128) });
const invitationSelection = spaceSelection.extend({ id: z.string().min(1).max(128) });
const invitationToken = z.strictObject({ token: z.string().regex(/^[a-f0-9]{64}$/) });
const cancelled = z.strictObject({ cancelled: z.number().int().nonnegative() });

export const spacesContract = {
  list: session.input(z.strictObject({})).output(z.array(membership)),
  create: session.input(spaceInputSchema).output(membership),
  get: session.input(spaceSelection).output(spaceSchema),
  rename: session.input(spaceSelection.extend(spaceInputSchema.shape)).output(spaceSchema),
  delete: session
    .input(spaceSelection)
    .output(z.strictObject({ spaceId: spaceIdSchema, status: z.literal("deleting") })),
  leave: session.input(spaceSelection).output(spaceMemberRemovalSchema),
  members: session.input(spaceSelection).output(z.array(spaceDirectoryMemberSchema)),
  updateMemberRole: session
    .input(memberSelection.extend({ role: spaceRoleSchema }))
    .output(spaceMemberSchema),
  removeMember: session.input(memberSelection).output(spaceMemberRemovalSchema),
  invitations: session.input(spaceSelection).output(z.array(spaceInvitationSchema)),
  createInvitation: session.input(spaceSelection).output(issuedSpaceInvitationSchema),
  cancelInvitation: session.input(invitationSelection).output(cancelled),
  cancelInvitations: session.input(spaceSelection).output(cancelled),
  previewInvitation: session.input(invitationToken).output(spaceInvitationPreviewSchema),
  acceptInvitation: session.input(invitationToken).output(spaceInvitationAcceptanceSchema),
  settings: session.input(spaceSelection).output(spaceSettingsSchema),
  setApprovalOverride: session
    .input(spaceSelection.extend({ mode: approvalModeInputSchema }))
    .output(spaceSettingsSchema),
  clearApprovalOverride: session.input(spaceSelection).output(spaceSettingsSchema),
  audit: session
    .input(
      spaceSelection.extend({
        cursor: z.string().min(1).max(512).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .output(spaceAuditPageSchema),
  events: session
    .input(
      spaceSelection.extend({
        after: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .output(z.array(spaceEventSchema).max(100)),
};
export const agentsContract = {
  models: session.input(spaceSelection).output(
    z.array(
      z.strictObject({
        modelId: z.string().min(1).max(200),
        name: z.string().min(1).max(200),
        source: z.enum(["deployment", "connection"]).default("deployment"),
        supportsImages: z.boolean().optional(),
      }),
    ),
  ),
  list: session
    .input(spaceSelection.extend({ limit: z.number().int().min(1).max(100).default(50) }))
    .output(z.array(agentConversation).max(100)),
  create: session
    .input(spaceSelection.extend({ agent: agentInputSchema }))
    .output(agentConversation),
  get: session.input(agentSelection).output(agentConversation),
  update: session
    .input(agentSelection.extend({ agent: agentInputSchema }))
    .output(agentConversation),
  delete: session.input(agentSelection).output(z.strictObject({ deleted: z.literal(true) })),
};

export const computersContract = {
  ...computerScreenContract,
  get: session.input(spaceSelection).output(spaceComputerSchema),
  start: session.input(spaceSelection).output(spaceComputerSchema),
  stop: session.input(spaceSelection).output(spaceComputerSchema),
  listDirectory: session
    .input(
      spaceSelection.extend({
        device: deviceComputerSelectionSchema.optional(),
        path: computerFilePathSchema.default("."),
        limit: z.number().int().min(1).max(MAX_COMPUTER_DIRECTORY_ENTRIES).default(100),
      }),
    )
    .output(computerDirectorySchema),
  readFile: session
    .input(
      spaceSelection.extend({
        device: deviceComputerSelectionSchema.optional(),
        path: computerFilePathSchema,
        maxBytes: z
          .number()
          .int()
          .min(1)
          .max(MAX_COMPUTER_FILE_BYTES)
          .default(MAX_COMPUTER_FILE_BYTES),
      }),
    )
    .output(computerFileSchema),
};
