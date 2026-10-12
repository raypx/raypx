import type { Translator } from "@voidmix/i18n";
import { toast } from "@voidmix/ui/toast";

import { translateKnownApiError } from "../../../i18n/api-errors";
import type { WebTranslator } from "../../i18n/client";

type AuthTranslator = Translator | WebTranslator<"errors">;

interface NotifyAuthFailureOptions {
  error: unknown;
  fallback: string;
  title: string;
  translateError: AuthTranslator;
}

export function notifyAuthFailure({
  error,
  fallback,
  title,
  translateError,
}: NotifyAuthFailureOptions): string {
  const description = getAuthErrorMessage(error, fallback, translateError);

  toast.add({
    title,
    description,
    type: "error",
    priority: "high",
  });

  return description;
}

/**
 * The API's stable code is the only server value that may become user-facing
 * copy. Unknown codes and library prose stay behind the generic fallback so a
 * diagnostic message cannot bypass the locale catalog.
 */
export function getAuthErrorMessage(
  error: unknown,
  fallback: string,
  translateError: AuthTranslator,
): string {
  const translated = translateKnownApiError(error, translateError);
  return translated ?? fallback;
}
