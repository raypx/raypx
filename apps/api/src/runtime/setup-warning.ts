const message =
  "SETUP_TOKEN is not configured: the first visitor to sign up becomes deployment administrator. Set SETUP_TOKEN before exposing this instance.";

/** Once per API process startup; never interpolate deployment values into diagnostics. */
export function createSetupWarning(
  environment: { NODE_ENV: string; SETUP_TOKEN?: string | undefined },
  registration: { status(): Promise<{ bootstrap: boolean }> },
  warn: (message: string) => void = console.warn,
) {
  let warned = false;
  return async () => {
    if (warned || environment.NODE_ENV !== "production" || environment.SETUP_TOKEN) return;
    if (!(await registration.status()).bootstrap) return;
    warned = true;
    warn(message);
  };
}
