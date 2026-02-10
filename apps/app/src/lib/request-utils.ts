/**
 * Get the base URL from a request
 * Handles localhost, reverse proxies, and production environments
 */
export function getBaseUrl(request: Request): string {
  // Method 1: Use request.url (most reliable)
  try {
    const url = new URL(request.url);
    return url.origin;
  } catch {
    // Fallback to headers if URL parsing fails
  }

  // Method 2: Check for reverse proxy headers (common in production)
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  // Method 3: Standard host header
  const host = request.headers.get("host");
  if (host) {
    const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
    return `${protocol}://${host}`;
  }

  // Fallback to production domain
  return "https://raypx.com";
}
