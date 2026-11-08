import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  instanceBindingSchema,
  instanceReceiptSchema,
  instanceIdentitySchema,
  enrollmentBeginSchema,
  enrollmentPollSchema,
  enrollmentCodeSchema,
  instanceCheckSchema,
  enrollmentStartSchema,
  enrollmentResultSchema,
} from "@raypx/instances";
export const instancesContract = {
  begin: oc.input(enrollmentBeginSchema).output(enrollmentStartSchema),
  inspect: oc.input(enrollmentCodeSchema).output(instanceIdentitySchema),
  approve: oc.input(enrollmentCodeSchema).output(z.object({ approved: z.literal(true) })),
  poll: oc.input(enrollmentPollSchema).output(enrollmentResultSchema),
  check: oc.input(instanceCheckSchema).output(instanceReceiptSchema),
  list: oc.input(z.object({})).output(z.array(instanceBindingSchema)),
  revoke: oc
    .input(z.object({ instanceId: z.uuid() }))
    .output(z.object({ revoked: z.literal(true) })),
};
