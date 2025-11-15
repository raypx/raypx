export type ErrorLocalization = {
  [key: string]: string | undefined;
  REQUEST_FAILED?: string;
};

/**
 * Converts error codes from SNAKE_CASE to camelCase
 * Example: INVALID_TWO_FACTOR_COOKIE -> invalidTwoFactorCookie
 */
export function errorCodeToCamelCase(errorCode: string): string {
  return errorCode.toLowerCase().replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Gets a localized error message from an error object
 */
export function getLocalizedError({
  error,
  localization,
}: {
  error: unknown;
  localization?: ErrorLocalization;
}): string {
  if (typeof error === "string") {
    if (localization?.[error]) return localization[error] as string;
  }

  const errorObj = error as {
    error?: {
      code?: string;
      message?: string;
      statusText?: string;
    };
    message?: string;
  };

  if (errorObj?.error) {
    if (errorObj.error.code) {
      const errorCode = errorObj.error.code;
      if (localization?.[errorCode]) return localization[errorCode] as string;
    }

    return (
      errorObj.error.message ||
      errorObj.error.code ||
      errorObj.error.statusText ||
      localization?.REQUEST_FAILED ||
      "Request failed"
    );
  }

  return errorObj?.message || localization?.REQUEST_FAILED || "Request failed";
}
