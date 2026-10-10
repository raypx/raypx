import { APIError } from "better-auth/api";

const redirectFields = [
  "callbackURL",
  "errorCallbackURL",
  "newUserCallbackURL",
  "redirectTo",
] as const;

function invalidRedirect(): APIError {
  return new APIError("FORBIDDEN", {
    code: "INVALID_AUTH_REDIRECT",
    message: "Invalid authentication redirect",
  });
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function validateRedirect(value: unknown, allowedOrigins: ReadonlySet<string>): void {
  if (value === undefined) return;
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    hasControlCharacters(value) ||
    value.includes("\\") ||
    value.startsWith("//")
  )
    throw invalidRedirect();
  if (value.startsWith("/")) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidRedirect();
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    !allowedOrigins.has(url.origin)
  )
    throw invalidRedirect();
}

function validateRedirectFields(input: unknown, allowedOrigins: ReadonlySet<string>): void {
  if (!input || typeof input !== "object") return;
  for (const field of redirectFields) {
    const value: unknown = Reflect.get(input, field);
    validateRedirect(value, allowedOrigins);
  }
}

function validateRedirectParameters(
  input: URLSearchParams,
  allowedOrigins: ReadonlySet<string>,
): void {
  for (const field of redirectFields) {
    const values = input.getAll(field);
    if (values.length > 1) throw invalidRedirect();
    for (const value of values) validateRedirect(value, allowedOrigins);
  }
}

export async function validateRequestRedirects(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
): Promise<void> {
  validateRedirectParameters(new URL(request.url).searchParams, allowedOrigins);
  if (!request.body) return;
  const mediaType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (mediaType === "application/json") {
    let body: unknown;
    try {
      body = await request.clone().json();
    } catch {
      return;
    } // Better Auth owns malformed JSON validation.
    validateRedirectFields(body, allowedOrigins);
  } else if (mediaType === "application/x-www-form-urlencoded") {
    validateRedirectParameters(new URLSearchParams(await request.clone().text()), allowedOrigins);
  }
}

export function parseOrigin(input: string, field: string, production: boolean): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Auth ${field} must be a valid HTTP(S) origin`);
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (production && url.protocol !== "https:")
  )
    throw new Error(
      `Auth ${field} must be an HTTP(S) origin${production ? " using HTTPS in production" : ""}`,
    );
  return url.origin;
}

export { validateRedirectFields, validateRedirectParameters };
