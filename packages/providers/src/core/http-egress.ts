import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
export class RemoteEndpointError extends Error {
  constructor() {
    super("INVALID_ENDPOINT");
  }
}
export interface ResolvedEndpoint {
  url: URL;
  address: string;
  family: 4 | 6;
}
export type RemoteResolver = (hostname: string) => Promise<{ address: string; family: number }[]>;
function normalizedHost(hostname: string) {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}
function v4Parts(address: string): number[] | null {
  if (isIP(address) !== 4) return null;
  return address.split(".").map(Number);
}
export function isLoopbackAddress(address: string): boolean {
  const host = normalizedHost(address);
  return host === "127.0.0.1" || host === "::1";
}
/** Reject non-global unicast, including IPv4-mapped IPv6 and translation prefixes. */
export function isPublicAddress(address: string): boolean {
  const host = normalizedHost(address);
  const parts = v4Parts(host);
  if (parts) {
    const [a = 0, b = 0, c = 0] = parts;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  // Only currently allocated global IPv6 unicast 2000::/3. Exclude documentation,
  // Teredo/6to4 and mapped/translation formats that could address private IPv4.
  if (isIP(host) !== 6 || !/^[23][0-9a-f]{0,3}:/.test(host)) return false;
  const groups = host.split(":");
  const first = Number.parseInt(groups[0]!, 16);
  const second = Number.parseInt(groups[1] || "0", 16);
  return first !== 0x2002 && !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8));
}
export function validateRemoteEndpoint(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RemoteEndpointError();
  }
  const host = normalizedHost(url.hostname);
  const loopback = host === "localhost" || isLoopbackAddress(host);
  if (
    value.length > 2048 ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    !host ||
    (isIP(host) && !isPublicAddress(host) && !isLoopbackAddress(host))
  )
    throw new RemoteEndpointError();
  return url;
}
export async function resolveRemoteEndpoint(
  value: string,
  resolver: RemoteResolver = (hostname) => lookup(hostname, { all: true }),
): Promise<ResolvedEndpoint> {
  const url = validateRemoteEndpoint(value);
  const host = normalizedHost(url.hostname);
  const literal = isIP(host);
  const addresses = literal ? [{ address: host, family: literal }] : await resolver(host);
  const explicitlyLocal = host === "localhost" || isLoopbackAddress(host);
  if (
    !addresses.length ||
    addresses.some(
      ({ address, family }) =>
        (family !== 4 && family !== 6) ||
        isIP(address) !== family ||
        (!isPublicAddress(address) && !(explicitlyLocal && isLoopbackAddress(address))),
    )
  )
    throw new RemoteEndpointError();
  if (url.protocol === "http:" && addresses.some(({ address }) => !isLoopbackAddress(address)))
    throw new RemoteEndpointError();
  const first = addresses[0]!;
  return { url, address: first.address, family: first.family as 4 | 6 };
}
