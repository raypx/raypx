import { z } from "zod";

/**
 * Private local HTTP endpoints. POSIX hosts listen on owner-only Unix sockets. Windows hosts
 * listen on loopback TCP: the bearer token is the access boundary, and browser-shaped or
 * rebound requests are rejected before authorization.
 */
export const localAddressSchema = z.union([
  z.object({ socket: z.string().min(1).max(104), port: z.undefined().optional() }),
  z.object({ port: z.number().int().min(1).max(65535), socket: z.undefined().optional() }),
]);
export type LocalAddress = z.infer<typeof localAddressSchema>;

/** `RAYPX_LOCAL_TRANSPORT=tcp` lets POSIX tests exercise the Windows transport. */
export const loopbackTransport = () =>
  process.platform === "win32" || process.env.RAYPX_LOCAL_TRANSPORT === "tcp";

export function localFetch(address: LocalAddress, path: string, init: RequestInit = {}) {
  if (address.socket !== undefined)
    return fetch(`http://localhost${path}`, { ...init, unix: address.socket, redirect: "error" });
  // Proxy environment variables would otherwise receive the bearer token.
  return fetch(`http://127.0.0.1:${address.port}${path}`, {
    ...init,
    proxy: false,
    redirect: "error",
  });
}

/** Only a direct local client reaches a loopback host; browsers always send Origin. */
export function foreignLoopbackRequest(request: Request, address: LocalAddress) {
  return (
    address.port !== undefined &&
    (request.headers.has("origin") || request.headers.get("host") !== `127.0.0.1:${address.port}`)
  );
}
