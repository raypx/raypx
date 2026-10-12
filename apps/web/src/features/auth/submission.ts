import { useState } from "react";
import { useTranslations } from "../../i18n/client";
import { notifyAuthFailure } from "./feedback";

type AuthRequest = () => Promise<{ error?: unknown }>;

export async function runAuthRequest(
  request: AuthRequest,
  fail: (error: unknown) => void,
): Promise<boolean> {
  try {
    const result = await request();
    if (!result.error) return true;
    fail(result.error);
  } catch (error) {
    fail(error);
  }
  return false;
}

export function useAuthSubmission(title: string, fallback: string) {
  const translateError = useTranslations("errors");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(request: AuthRequest) {
    setPending(true);
    setError(null);
    const succeeded = await runAuthRequest(request, (error) => {
      setError(notifyAuthFailure({ translateError, title, error, fallback }));
    });
    setPending(false);
    return succeeded;
  }
  return { error, pending, submit };
}
