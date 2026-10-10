import { HttpError, withHttpRequest, errorResponse, readRequestBody } from "@raypx/api/http";
import type { SessionResponse } from "@raypx/contracts/auth";
import { createSameOriginGuard } from "@raypx/api/security";
import { services } from "./runtime.server";

const originGuard = services.env.BETTER_AUTH_URL
  ? createSameOriginGuard({ origin: services.env.APP_ORIGIN ?? services.env.BETTER_AUTH_URL })
  : undefined;

async function readSession(request: Request) {
  return services.auth
    ? services.auth.api.getSession({ headers: request.headers, returnHeaders: true })
    : { headers: new Headers(), response: null };
}

/** Exposes the selected auth provider through the request boundary and origin guard. */
export const authResponse = ({ request }: { request: Request }) =>
  withHttpRequest(
    request,
    async ({ signal }) => {
      if (!services.auth) throw new HttpError("NOT_FOUND");
      const providerRequest = request.body
        ? new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: await readRequestBody(request, {
              maxBytes: services.env.API_BODY_MAX_BYTES,
              timeoutMs: services.env.API_BODY_TIMEOUT_MS,
              signal,
            }),
            signal,
          })
        : request;
      const response = await services.auth.handler(providerRequest);
      if (response.ok || response.status < 400) return response;
      const code =
        response.status === 408
          ? "REQUEST_TIMEOUT"
          : response.status === 413
            ? "PAYLOAD_TOO_LARGE"
            : response.status === 415
              ? "UNSUPPORTED_MEDIA_TYPE"
              : response.status === 401
                ? "UNAUTHORIZED"
                : response.status === 403
                  ? "FORBIDDEN"
                  : response.status === 404
                    ? "NOT_FOUND"
                    : response.status === 409
                      ? "CONFLICT"
                      : response.status === 429
                        ? "RATE_LIMITED"
                        : response.status >= 500
                          ? "INTERNAL_ERROR"
                          : "VALIDATION_ERROR";
      return errorResponse(new HttpError(code, undefined, { headers: response.headers }));
    },
    { route: "/api/auth/*", guards: originGuard ? [originGuard] : [] },
  );

/** Returns a public projection of the current account, including anonymous state. */
export const sessionResponse = ({ request }: { request: Request }) =>
  withHttpRequest(
    request,
    async () => {
      const result = await readSession(request);
      const session = result.response;
      const user = session
        ? {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            emailVerified: session.user.emailVerified,
            image: session.user.image ?? null,
          }
        : null;
      const headers = new Headers(result.headers);
      headers.set("cache-control", "no-store");
      return Response.json({ user } satisfies SessionResponse, { headers });
    },
    { route: "/api/session" },
  );

/** Example protected read, using the same public projection as anonymous session checks. */
export const currentUserResponse = ({ request }: { request: Request }) =>
  withHttpRequest(
    request,
    async () => {
      if (!services.auth) throw new HttpError("UNAUTHORIZED");
      const result = await readSession(request);
      const session = result.response;
      if (!session) throw new HttpError("UNAUTHORIZED", undefined, { headers: result.headers });
      const headers = new Headers(result.headers);
      headers.set("cache-control", "no-store");
      return Response.json(
        {
          user: {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            emailVerified: session.user.emailVerified,
            image: session.user.image ?? null,
          },
        },
        { headers },
      );
    },
    { route: "/api/me" },
  );
