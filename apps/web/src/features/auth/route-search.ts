/**
 * Authentication pages may receive a post-authentication destination from a
 * protected route. Keep that value relative to this origin so an auth link can
 * never become an open redirect.
 */
export function normalizeAuthRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || value !== value.trim()) return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return undefined;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return undefined;
  }

  try {
    const parsed = new URL(value, "https://voidmix.invalid");
    if (parsed.origin !== "https://voidmix.invalid") return undefined;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return undefined;
  }
}

export interface AuthSearch {
  redirect?: string;
}

export function validateAuthSearch(search: Record<string, unknown>): AuthSearch {
  const redirect = normalizeAuthRedirect(search.redirect);
  return redirect ? { redirect } : {};
}

export function createVerificationCallbackUrl(origin: string, redirectTo?: string): string {
  const callback = new URL("/verify-email", origin);
  callback.searchParams.set("verified", "1");

  const redirect = normalizeAuthRedirect(redirectTo);
  if (redirect) callback.searchParams.set("redirect", redirect);

  return callback.toString();
}

export function createPasswordResetCallbackUrl(origin: string, redirectTo?: string): string {
  const callback = new URL("/reset-password", origin);

  const redirect = normalizeAuthRedirect(redirectTo);
  if (redirect) callback.searchParams.set("redirect", redirect);

  return callback.toString();
}
