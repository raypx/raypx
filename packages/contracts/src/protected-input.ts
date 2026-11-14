import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  protectedInputAnswerSchema,
  protectedInputRequestSchema,
} from "@raypx/core/protected-input";
import { spaceIdSchema } from "@raypx/core/spaces";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";

const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
export const protectedInputsContract = {
  pending: session
    .input(z.strictObject({ spaceId: spaceIdSchema }))
    .output(z.array(protectedInputRequestSchema).max(100)),
  answer: session
    .input(
      z.strictObject({
        spaceId: spaceIdSchema,
        requestId: protectedInputRequestSchema.shape.id,
        answer: protectedInputAnswerSchema,
      }),
    )
    .output(protectedInputRequestSchema),
};
