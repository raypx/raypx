/** Reads the stable code carried by a LocalError or an API error payload. */
export function failureCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const failure = error as { code?: string; data?: { error?: { code?: string } } };
  return failure.data?.error?.code ?? failure.code;
}
