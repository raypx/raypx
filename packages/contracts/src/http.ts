import { oc } from "@orpc/contract";
import { openapi, type OpenAPIV3_2 } from "@orpc/openapi";

export const httpApiPrefix = "/api/v1";

const sessionSecurity: OpenAPIV3_2.SecurityRequirementObject[] = [
  { sessionCookie: [] },
  { secureSessionCookie: [] },
];
const security = {
  required: sessionSecurity,
  optional: [{}, ...sessionSecurity],
  public: [],
};

const errorResponse: OpenAPIV3_2.ResponseObject = {
  description: "Request failed",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          defined: { type: "boolean" },
          code: { type: "string" },
          message: { type: "string" },
          data: {},
        },
        required: ["defined", "code", "message"],
      },
    },
  },
};

/** Opt a contract procedure into the versioned JSON API with oRPC metadata. */
export function httpRead(
  path: `/${string}`,
  tag: string,
  summary: string,
  session: keyof typeof security = "required",
) {
  return oc.meta(
    openapi({
      method: "GET",
      path,
      prefix: httpApiPrefix,
      tags: [tag],
      summary,
      spec: (operation) => ({
        ...operation,
        security: security[session],
        responses: { default: errorResponse, ...operation.responses },
      }),
    }),
  );
}
