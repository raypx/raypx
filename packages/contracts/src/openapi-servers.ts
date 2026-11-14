import { oc } from "@orpc/contract";
import { z } from "zod";
import { spaceIdSchema } from "@raypx/core/spaces";
import {
  openApiServerIdSchema,
  openApiServerSchema,
  openApiServerConfigurationSchema,
  openApiSourceSchema,
  openApiCredentialSchema,
  openApiTestCodeSchema,
} from "@raypx/core/openapi-servers";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";
const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
const selection = z.strictObject({ spaceId: spaceIdSchema, id: openApiServerIdSchema });
export const openApiServersContract = {
  list: session
    .input(z.strictObject({ spaceId: spaceIdSchema }))
    .output(z.array(openApiServerSchema).max(32)),
  create: session
    .input(
      z.strictObject({
        spaceId: spaceIdSchema,
        server: openApiServerConfigurationSchema,
        source: openApiSourceSchema,
        credential: openApiCredentialSchema.optional(),
      }),
    )
    .output(openApiServerSchema),
  update: session
    .input(
      selection.extend({
        server: openApiServerConfigurationSchema,
        credential: openApiCredentialSchema.optional(),
      }),
    )
    .output(openApiServerSchema),
  delete: session.input(selection).output(z.strictObject({ deleted: z.literal(true) })),
  test: session.input(selection).output(
    z.strictObject({
      code: openApiTestCodeSchema,
      operationIds: z.array(z.string().max(64)).max(128),
    }),
  ),
};
