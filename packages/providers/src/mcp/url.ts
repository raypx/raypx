import {
  RemoteEndpointError,
  validateRemoteEndpoint,
  resolveRemoteEndpoint,
} from "../core/http-egress.js";
export { isPublicAddress } from "../core/http-egress.js";
export type { ResolvedEndpoint, RemoteResolver as McpResolver } from "../core/http-egress.js";
import type { RemoteResolver } from "../core/http-egress.js";
export class McpTransportError extends Error {
  constructor(
    readonly code:
      | "INVALID_ENDPOINT"
      | "AUTHENTICATION_FAILED"
      | "RATE_LIMITED"
      | "TIMED_OUT"
      | "REQUEST_FAILED"
      | "TOOL_LIMIT",
  ) {
    super(code);
    this.name = "McpTransportError";
  }
}

export function validateMcpEndpoint(value: string): URL {
  try {
    return validateRemoteEndpoint(value);
  } catch (error) {
    if (error instanceof RemoteEndpointError) throw new McpTransportError("INVALID_ENDPOINT");
    throw error;
  }
}
export async function resolveMcpEndpoint(value: string, resolver?: RemoteResolver) {
  try {
    return await resolveRemoteEndpoint(value, resolver);
  } catch (error) {
    if (error instanceof RemoteEndpointError) throw new McpTransportError("INVALID_ENDPOINT");
    throw error;
  }
}
