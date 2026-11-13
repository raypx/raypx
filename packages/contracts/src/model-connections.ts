import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  modelConnectionConfigurationSchema,
  modelConnectionIdSchema,
  modelConnectionSchema,
  modelConnectionTestCodeSchema,
} from "@raypx/core/model-connections";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";

const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
const selection = z.strictObject({ id: modelConnectionIdSchema });
const secret = z.string().min(1).max(8192);
export const modelConnectionsContract = {
  list: session.input(z.strictObject({})).output(z.array(modelConnectionSchema).max(100)),
  create: session
    .input(z.strictObject({ connection: modelConnectionConfigurationSchema, secret }))
    .output(modelConnectionSchema),
  update: session
    .input(
      selection.extend({
        connection: modelConnectionConfigurationSchema,
        secret: secret.optional(),
      }),
    )
    .output(modelConnectionSchema),
  delete: session.input(selection).output(z.strictObject({ deleted: z.literal(true) })),
  test: session
    .input(selection.extend({ model: z.string().min(1).max(128).optional() }))
    .output(z.strictObject({ code: modelConnectionTestCodeSchema })),
};
