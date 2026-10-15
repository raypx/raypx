import { oc } from "@orpc/contract";
import { z } from "zod";

export const accountProfileSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  name: z.string(),
});
export type AccountProfile = z.infer<typeof accountProfileSchema>;
export type AccountProfileDto = AccountProfile;

export const apiErrorDataSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    values: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
  }),
  requestId: z.string().min(1),
});
export type ApiErrorData = z.infer<typeof apiErrorDataSchema>;

/** Local execution is deliberately absent from the public HTTP router. */
export const apiContract = {
  account: {
    get: oc.input(z.object({})).output(accountProfileSchema),
  },
};
