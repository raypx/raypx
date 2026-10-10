import { sessionResponseSchema, type SessionResponse } from "@raypx/contracts/auth";
import { requestJson } from "./http.js";

/** Loads the public session projection through the application's same-origin endpoint. */
export function getSession(options: { signal?: AbortSignal } = {}): Promise<SessionResponse> {
  return requestJson({
    path: "/api/session",
    schema: sessionResponseSchema,
    signal: options.signal,
  });
}
