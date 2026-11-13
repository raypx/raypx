import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";
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
  begin: oc
    .meta(exposeApiTo("host"), rpcAccess("public"))
    .input(enrollmentBeginSchema)
    .output(enrollmentStartSchema),
  inspect: oc
    .meta(exposeApiTo("renderer"), rpcAccess("projects.read"))
    .input(enrollmentCodeSchema)
    .output(instanceIdentitySchema),
  approve: oc
    .meta(exposeApiTo("renderer"), rpcAccess("projects.read"))
    .input(enrollmentCodeSchema)
    .output(z.object({ approved: z.literal(true) })),
  poll: oc
    .meta(exposeApiTo("host"), rpcAccess("public"))
    .input(enrollmentPollSchema)
    .output(enrollmentResultSchema),
  check: oc
    .meta(exposeApiTo("host"), rpcAccess("public"))
    .input(instanceCheckSchema)
    .output(instanceReceiptSchema),
  list: oc
    .meta(exposeApiTo("renderer"), rpcAccess("projects.read"))
    .input(z.object({}))
    .output(z.array(instanceBindingSchema)),
  revoke: oc
    .meta(exposeApiTo("renderer"), rpcAccess("projects.read"))
    .input(z.object({ instanceId: z.uuid() }))
    .output(z.object({ revoked: z.literal(true) })),
};
