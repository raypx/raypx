import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "./context";
import { appRouter } from "./routers";

export const createHandler = (props: { prefix: `/${string}` }) => {
  const rpcHandler = new RPCHandler(appRouter, {
    plugins: [
      new CORSPlugin({
        origin: (origin) => origin,
        allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH", "OPTIONS", "ANY"],
      }),
    ],
    interceptors: [
      onError((error: Error) => {
        console.error(error);
      }),
    ],
  });

  const apiHandler = new OpenAPIHandler(appRouter, {
    plugins: [
      new OpenAPIReferencePlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
      }),
    ],
    interceptors: [
      onError((error: Error) => {
        console.error(error);
      }),
    ],
  });

  /**
   * Create a handler for the given prefix
   * @param props.prefix - The prefix to use for the handler
   * @returns A function that handles the request
   */
  return async ({ request }: { request: Request }) => {
    const rpcResult = await rpcHandler.handle(request, {
      prefix: props.prefix,
      context: await createContext({ req: request }),
    });
    if (rpcResult.response) return rpcResult.response;

    const apiResult = await apiHandler.handle(request, {
      prefix: `${props.prefix}/api-reference`,
      context: await createContext({ req: request }),
    });
    if (apiResult.response) return apiResult.response;

    return new Response("Not found", { status: 404 });
  };
};
