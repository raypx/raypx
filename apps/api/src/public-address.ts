import { isIP } from "node:net";
import { getDomain } from "tldts";
import { nativeClientOrigins, normalizeTrustedOrigins } from "@raypx/core/auth";

/** Messages contain setting names and rules only, never supplied values. */
export class PublicAddressConfigurationError extends Error {}

type RuntimeEnvironment = Record<string, string | undefined>;

/** Reject even empty retired settings before environment preprocessing drops them. */
export function rejectRetiredOriginInputs(environment: RuntimeEnvironment) {
  const replacements = {
    AUTH_URL: "PUBLIC_URL (API_PUBLIC_URL only for a separate API origin)",
    ALLOWED_ORIGINS: "PUBLIC_URL and optional EXTRA_ALLOWED_ORIGINS",
    DEVICE_CONNECTOR_ORIGIN: "PUBLIC_URL (API_PUBLIC_URL only for a separate API origin)",
  };
  for (const [key, replacement] of Object.entries(replacements)) {
    if (environment[key] !== undefined)
      throw new PublicAddressConfigurationError(
        `${key} is no longer supported; delete it and configure ${replacement}`,
      );
  }
}

function browserOrigin(value: string, key: string, httpsOnly: boolean) {
  try {
    // Inspect the input as well as URL: URL parsing erases slashes, empty query
    // markers, backslashes and dot paths that are not valid origin settings.
    if (!/^https?:\/\/[^/?#\\\s]+$/i.test(value) || value.includes("*") || value.includes("@"))
      throw new Error();
    const url = new URL(value);
    if (["0.0.0.0", "[::]", "255.255.255.255"].includes(url.hostname))
      throw new PublicAddressConfigurationError(
        `${key} cannot use an unspecified or broadcast host; device connectors require a reachable public API origin`,
      );
    if (
      url.username ||
      url.password ||
      url.hostname.includes("*") ||
      (httpsOnly && url.protocol !== "https:")
    )
      throw new Error();
    return url.origin;
  } catch (error) {
    if (error instanceof PublicAddressConfigurationError) throw error;
    throw new PublicAddressConfigurationError(
      `${key} must be an exact ${httpsOnly ? "HTTPS" : "HTTP(S)"} origin without a trailing slash, path, query, fragment, credentials or wildcard`,
    );
  }
}

/** One derivation for API, worker and Relay; no role accepts a second trust list. */
export function derivePublicAddress(
  environment: {
    NODE_ENV: string;
    PUBLIC_URL: string;
    API_PUBLIC_URL?: string | undefined;
    EXTRA_ALLOWED_ORIGINS: string;
  },
  runtime: RuntimeEnvironment,
) {
  const production = environment.NODE_ENV === "production";
  if (production && !runtime.PUBLIC_URL)
    throw new PublicAddressConfigurationError("Production requires PUBLIC_URL");
  const publicWebOrigin = browserOrigin(environment.PUBLIC_URL, "PUBLIC_URL", production);
  const apiDefault = runtime.PUBLIC_URL ? publicWebOrigin : "http://localhost:3002";
  const publicApiOrigin = browserOrigin(
    environment.API_PUBLIC_URL ?? apiDefault,
    "API_PUBLIC_URL",
    production,
  );
  const nativeOrigins = Object.values(nativeClientOrigins);
  const extras = environment.EXTRA_ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      if (nativeOrigins.some((origin) => origin === value)) return value;
      return browserOrigin(value, "EXTRA_ALLOWED_ORIGINS", false);
    });
  return {
    publicWebOrigin,
    publicApiOrigin,
    allowedOrigins: normalizeTrustedOrigins([
      publicWebOrigin,
      publicApiOrigin,
      ...nativeOrigins,
      ...extras,
    ]),
  };
}

/** Local consistency only: this performs no DNS, HTTP or provider calls. */
export function validatePublicAddressSecurity(
  address: { publicWebOrigin: string; publicApiOrigin: string },
  environment: { AUTH_DOMAIN?: string | undefined; AUTH_PASSKEY_RP_ID?: string | undefined },
) {
  const web = new URL(address.publicWebOrigin);
  const api = new URL(address.publicApiOrigin);
  const covers = (host: string, domain: string) =>
    host === domain || (!isIP(host) && host.endsWith(`.${domain}`));
  const rp = environment.AUTH_PASSKEY_RP_ID || api.hostname;
  if (
    !covers(web.hostname, rp) ||
    !covers(api.hostname, rp) ||
    (!isIP(rp) && rp !== "localhost" && !getDomain(rp, { allowPrivateDomains: true }))
  )
    throw new PublicAddressConfigurationError(
      "AUTH_PASSKEY_RP_ID must be a registrable domain suffix of both PUBLIC_URL and API_PUBLIC_URL hosts; set their shared parent domain for split origins",
    );
  const domain = environment.AUTH_DOMAIN?.replace(/^\./, "").toLowerCase();
  if (
    domain &&
    (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(domain) ||
      !covers(web.hostname, domain) ||
      !covers(api.hostname, domain) ||
      (!isIP(domain) &&
        domain !== "localhost" &&
        !getDomain(domain, { allowPrivateDomains: true })))
  )
    throw new PublicAddressConfigurationError(
      "AUTH_DOMAIN must be a registrable cookie domain covering both PUBLIC_URL and API_PUBLIC_URL hosts",
    );
  if (web.hostname !== api.hostname && !domain)
    throw new PublicAddressConfigurationError(
      "Split PUBLIC_URL and API_PUBLIC_URL hosts require AUTH_DOMAIN covering both hosts so Web SSR can receive the API session cookie",
    );
  if (web.protocol !== api.protocol)
    throw new PublicAddressConfigurationError(
      "PUBLIC_URL and API_PUBLIC_URL must use the same scheme for credentialed browser requests",
    );
}
