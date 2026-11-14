import { z } from "zod";
export const LOCAL_PROTOCOL_VERSION = 1 as const;
export const localParams = { "runtime.info": z.strictObject({}) } as const;
export type LocalMethod = keyof typeof localParams;
export type LocalParams<M extends LocalMethod> = z.input<(typeof localParams)[M]>;
export const localEventSchema = z.object({
  version: z.literal(1),
  event: z.literal("engine.status"),
  data: z.record(z.string(), z.unknown()),
});
export type LocalEvent = z.infer<typeof localEventSchema>;
