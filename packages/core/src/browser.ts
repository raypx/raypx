import { z } from "zod";
import { conversationIdSchema } from "./agents.js";
import { spaceIdSchema } from "./spaces.js";
import { pageFormFieldsSchema } from "./pages.js";

export const browserSelectionSchema = z.strictObject({
  spaceId: spaceIdSchema,
  conversationId: conversationIdSchema,
});
export const browserUrlSchema = z
  .url({ protocol: /^https$/ })
  .max(2_048)
  .regex(/^https:\/\/[^/?#@\\]+(?:[/?#]|$)/i);
export const browserControlTokenSchema = z.uuid();
export const browserInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("click"),
    x: z.number().int().min(0).max(1_919),
    y: z.number().int().min(0).max(1_199),
  }),
  z.strictObject({
    kind: z.literal("scroll"),
    delta: z.number().int().min(-1_200).max(1_200),
  }),
  z.strictObject({
    kind: z.literal("key"),
    key: z.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_+-]{0,31}$/),
  }),
  z.strictObject({ kind: z.literal("text"), text: z.string().min(1).max(2_000) }),
]);
export const browserFrameSchema = z.strictObject({
  width: z.number().int().min(1).max(1_920),
  height: z.number().int().min(1).max(1_200),
  jpeg: z.base64().max(1_048_576),
});
export const browserViewSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.enum(["unavailable", "closed"]) }),
  z.strictObject({
    state: z.literal("open"),
    origin: z.string().max(300),
    controlled: z.boolean(),
    frame: browserFrameSchema.nullable(),
  }),
]);
export const browserFormSchema = z.strictObject({
  origin: browserUrlSchema,
  formToken: z.uuid(),
  fields: pageFormFieldsSchema,
});
export const browserInspectionSchema = z.strictObject({
  origin: browserUrlSchema,
  formToken: z.uuid(),
  fields: z
    .array(z.strictObject({ name: z.string().max(120), label: z.string().max(160) }))
    .max(24),
});
export const browserAcceptedSchema = z.strictObject({ accepted: z.literal(true) });
const memberBrowserCommands = [
  z.strictObject({ op: z.literal("open"), url: browserUrlSchema }),
  z.strictObject({ op: z.literal("close") }),
  z.strictObject({ op: z.literal("takeover"), token: browserControlTokenSchema }),
  z.strictObject({ op: z.literal("release"), token: browserControlTokenSchema }),
  z.strictObject({
    op: z.literal("input"),
    token: browserControlTokenSchema,
    input: browserInputSchema,
  }),
] as const;
export const memberBrowserCommandSchema = z.discriminatedUnion("op", memberBrowserCommands);
export const browserCommandSchema = z.discriminatedUnion("op", [
  ...memberBrowserCommands,
  z.strictObject({ op: z.literal("view"), token: browserControlTokenSchema.optional() }),
  z.strictObject({ op: z.literal("inspect") }),
  browserFormSchema.extend({ op: z.literal("fill") }),
]);
export type BrowserCommand = z.infer<typeof browserCommandSchema>;
export type MemberBrowserCommand = z.infer<typeof memberBrowserCommandSchema>;
export type BrowserView = z.infer<typeof browserViewSchema>;
export type BrowserInput = z.infer<typeof browserInputSchema>;
