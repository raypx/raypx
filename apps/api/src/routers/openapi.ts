import { Hono } from "hono";
import { methodNotAllowed } from "hono/method-not-allowed";
import { SmartCoercionHandlerPlugin } from "@orpc/json-schema";
import { apiContentSecurityPolicy } from "../middleware/http.js";
import { procedureRequest, type ApiRouterEnv } from "./request.js";
import {
  getOpenAPIMeta,
  OpenAPIGenerator,
  type OpenAPIV3_1,
  type OpenAPIV3_2,
} from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferenceHandlerPlugin } from "@orpc/openapi/plugins";
import { walkProcedureContractsSync } from "@orpc/server";
import { TimeoutHandlerPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import type { createHealthRoutes } from "./health.js";
import { openApiAssetsPath, openApiDocsPath, openApiDocumentPath } from "./openapi-paths.js";
import { httpApiPrefix } from "@raypx/contracts/api";
import type { createRpcRouter } from "./rpc/index.js";

type RpcRouter = ReturnType<typeof createRpcRouter>;
type RequestContext = { headers: Headers; requestId: string };

const version = "3.1.0";
const info = { title: "Raypx API", version: "1.0.0" };
const converters = [new ZodToJsonSchemaConverter()];
const generator = new OpenAPIGenerator({ converters });
const base: Partial<OpenAPIV3_2.OpenAPIObject> = {
  info,
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      sessionCookie: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
      secureSessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "__Secure-better-auth.session_token",
      },
    },
  },
};

function isVersionedHttpProcedure(procedure: Parameters<typeof getOpenAPIMeta>[0]) {
  return getOpenAPIMeta(procedure)?.prefix === httpApiPrefix;
}

export function createOpenApiRoutes(
  router: RpcRouter,
  health: ReturnType<typeof createHealthRoutes>,
  timeoutMs: number,
) {
  const routes = new Hono<ApiRouterEnv>();
  const handler = new OpenAPIHandler<RequestContext>(router, {
    filter: isVersionedHttpProcedure,
    plugins: [
      new TimeoutHandlerPlugin({ timeout: timeoutMs }),
      new SmartCoercionHandlerPlugin({ converters }),
    ],
  });
  let spec: Promise<OpenAPIV3_1.OpenAPIObject> | undefined;

  async function generate(): Promise<OpenAPIV3_1.OpenAPIObject> {
    const document = await generator.generate(router, {
      version,
      filter: isVersionedHttpProcedure,
      base,
    });
    // The Hono health schemas are inline. Only its paths need merging here.
    const native = health.getOpenAPI31Document({ openapi: version, info });
    return {
      ...document,
      paths: { ...native.paths, ...document.paths },
    };
  }

  function readDocument() {
    return (spec ??= generate().catch((error: unknown) => {
      spec = undefined;
      throw error;
    }));
  }

  const reference = new OpenAPIHandler<RequestContext>(
    {},
    {
      plugins: [
        new OpenAPIReferenceHandlerPlugin({
          spec: readDocument,
          specPath: openApiDocumentPath,
          docsPath: openApiDocsPath,
          provider: "swagger",
          providerScriptUrl: `${openApiAssetsPath}/swagger-ui-bundle.js`,
          providerCssUrl: `${openApiAssetsPath}/swagger-ui.css`,
          providerConfig: {
            validatorUrl: null,
            persistAuthorization: false,
            withCredentials: true,
          },
        }),
      ],
    },
  );
  for (const path of [openApiDocsPath, openApiDocumentPath]) {
    routes.get(path, async (c) => {
      c.header("cache-control", "no-store");
      const { request, context } = procedureRequest(c, "GET");
      const result = await reference.handle(request, { context });
      if (!result.matched) return c.notFound();
      if (path === openApiDocumentPath) return result.response;

      const nonce = crypto.randomUUID();
      c.header(
        "content-security-policy",
        `${apiContentSecurityPolicy}; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'`,
      );
      return new HTMLRewriter()
        .on("script:not([src])", {
          element: (element) => {
            element.setAttribute("nonce", nonce);
          },
        })
        .transform(result.response);
    });
  }
  routes.use(
    `${httpApiPrefix}/*`,
    methodNotAllowed({
      app: routes,
      onMethodNotAllowed: (c, methods) =>
        c.json({ error: { code: "METHOD_NOT_ALLOWED" }, requestId: c.get("requestId") }, 405, {
          Allow: methods.join(", "),
        }),
    }),
  );
  walkProcedureContractsSync(router, (procedure) => {
    const meta = getOpenAPIMeta(procedure);
    if (meta?.prefix !== httpApiPrefix || meta.method !== "GET" || !meta.path) return;
    const path = `${httpApiPrefix}${meta.path.replaceAll(/\{(\w+)\}/g, ":$1")}`;
    routes.get(path, async (c) => {
      c.header("cache-control", "no-store");
      // Hono runs GET handlers for HEAD and strips the response body itself.
      const { request, context } = procedureRequest(c, "GET");
      const result = await handler.handle(request, { context });
      return result.matched ? result.response : c.notFound();
    });
  });
  return routes;
}
