import { z } from "zod";
import { localParams, type LocalParams, type LocalMethod } from "./local.js";
export const localResults = {
  "runtime.info": z.object({
    version: z.string(),
    protocolVersion: z.literal(1),
    owner: z.literal("daemon"),
  }),
} as const satisfies Record<LocalMethod, z.ZodType>;
export type LocalClientMethod = keyof typeof localResults;
export type LocalResult<M extends LocalClientMethod> = z.output<(typeof localResults)[M]>;
export type LocalTransport = (method: LocalClientMethod, params: unknown) => Promise<unknown>;
export type LocalClient = <M extends LocalClientMethod>(
  method: M,
  params: LocalParams<NoInfer<M>>,
) => Promise<LocalResult<M>>;

export function createLocalClient(transport: LocalTransport): LocalClient {
  return async <M extends LocalClientMethod>(
    method: M,
    params: LocalParams<NoInfer<M>>,
  ): Promise<LocalResult<M>> => {
    const validated = localParams[method].parse(params);
    const value = await transport(method, validated);
    // Indexing a schema map loses the method/reply correlation inside the implementation.
    return localResults[method].parse(value);
  };
}
