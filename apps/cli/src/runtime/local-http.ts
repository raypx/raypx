import { directHttpClient } from "@raypx/runtime-node/http";
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

export async function localFetch(address: LocalAddress, path: string, init: RequestInit = {}) {
  // A dedicated dispatcher deliberately ignores proxy environment and global dispatchers.
  const client = directHttpClient(address.socket);
  try {
    const response = await client.fetch(
      address.socket === undefined
        ? `http://127.0.0.1:${address.port}${path}`
        : `http://localhost${path}`,
      {
        ...init,
        redirect: "error",
      },
    );
    // close() waits for the streaming response to finish; never await it here.
    void client.close().catch(() => {});
    return response;
  } catch (error) {
    void client.close().catch(() => {});
    throw error;
  }
}

/** Only a direct local client reaches a loopback host; browsers always send Origin. */
export function foreignLoopbackRequest(request: Request, address: LocalAddress) {
  return (
    address.port !== undefined &&
    (request.headers.has("origin") || request.headers.get("host") !== `127.0.0.1:${address.port}`)
  );
}
