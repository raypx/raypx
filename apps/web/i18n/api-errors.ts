import { translateKnownErrorCode, type ErrorCodeMap, type Translator } from "@voidmix/i18n";
import type { WebTranslator } from "../src/i18n/client";

/**
 * Every code the API can put on the wire, mapped to an `errors` message key.
 * `apps/api/server/api/runtime.ts` sends the code alone — the prose it used
 * to send was removed on the understanding that clients translate the code, so a
 * code missing from this map costs the user the reason for the rejection.
 */
const ERROR_KEYS = {
  CLOUD_ACCESS_DENIED: "accessDenied",
  CLOUD_NOT_FOUND: "resourceNotFound",
  CLOUD_BUDGET_EXCEEDED: "cloudBudgetExceeded",
  CLOUD_RUN_ACTIVE: "cloudRunActive",
  CLOUD_RUN_TERMINAL: "cloudRunTerminal",
  CLOUD_CAPABILITY_DISABLED: "cloudUnavailable",
  CLOUD_RATE_LIMIT_UNAVAILABLE: "cloudUnavailable",
  CLOUD_UPLOAD_MISMATCH: "cloudUploadMismatch",
  CLOUD_REVISION_INVALID: "cloudRevisionInvalid",
  CLOUD_IDEMPOTENCY_CONFLICT: "cloudIntentConflict",
  UNAUTHORIZED: "signInRequired",
  FORBIDDEN: "accessDenied",
  PROJECT_ACCESS_DENIED: "accessDenied",
  NOT_FOUND: "resourceNotFound",
  PROJECT_NOT_FOUND: "projectNotFound",
  USER_NOT_FOUND: "userNotFound",
  MAIL_NOT_CONFIGURED: "mailNotConfigured",
  REGISTRATION_DISABLED: "registrationDisabled",
  EMAIL_VERIFICATION_DISABLED: "emailVerificationDisabled",
  EMAIL_DOMAIN_NOT_ALLOWED: "emailDomainNotAllowed",
  PASSWORD_RESET_DISABLED: "passwordResetDisabled",
} as const;
const ERROR_KEY_MAP: ErrorCodeMap = ERROR_KEYS;

type ApiErrorTranslator = Translator | WebTranslator<"errors">;

function asCoreTranslator(t: ApiErrorTranslator): Translator {
  return t as unknown as Translator;
}

/**
 * Localizes only errors whose code this map knows, so a caller can keep its own
 * more specific fallback for everything else.
 */
export function translateKnownApiError(error: unknown, t: ApiErrorTranslator): string | null {
  return translateKnownErrorCode(error, asCoreTranslator(t), ERROR_KEY_MAP);
}
