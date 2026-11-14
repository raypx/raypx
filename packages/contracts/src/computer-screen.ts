import { oc } from "@orpc/contract";
import { z } from "zod";
import { computerScreenInputSchema, computerScreenStateSchema } from "@raypx/core/computers";
import { spaceIdSchema } from "@raypx/core/spaces";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";

const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
const selection = z.strictObject({ spaceId: spaceIdSchema });
const grant = selection.extend({ grantId: z.uuid() });
export const computerScreenContract = {
  screenAvailability: session.input(selection).output(computerScreenStateSchema),
  startScreen: session.input(selection).output(computerScreenStateSchema),
  stopScreen: session.input(selection).output(computerScreenStateSchema),
  acquireControl: session
    .input(selection.extend({ viewerId: z.uuid() }))
    .output(computerScreenStateSchema),
  renewControl: session.input(grant).output(computerScreenStateSchema),
  releaseControl: session.input(grant).output(computerScreenStateSchema),
  forceReleaseControl: session.input(selection).output(computerScreenStateSchema),
  screenInput: session
    .input(grant.extend({ input: computerScreenInputSchema }))
    .output(z.strictObject({ accepted: z.literal(true) })),
};
