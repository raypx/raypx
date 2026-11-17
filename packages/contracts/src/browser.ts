import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  browserAcceptedSchema,
  browserControlTokenSchema,
  browserSelectionSchema,
  browserViewSchema,
  memberBrowserCommandSchema,
} from "@raypx/core/browser";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";

const session = oc.meta(exposeApiTo("web"), rpcAccess("session"));
export const browsersContract = {
  view: session
    .input(browserSelectionSchema.extend({ token: browserControlTokenSchema.optional() }))
    .output(browserViewSchema),
  command: session
    .input(browserSelectionSchema.extend({ command: memberBrowserCommandSchema }))
    .output(z.union([browserViewSchema, browserAcceptedSchema])),
};
