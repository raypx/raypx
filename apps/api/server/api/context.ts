import type { Session } from "@voidmix/auth";
import type { Locale } from "@voidmix/i18n/types";

export interface ApiRequestAuthContext {
  session: Session | null;
  user: Session["user"] | null;
  /** Long-lived subscriptions must revalidate the original request's session. */
  revalidateSession?: () => Promise<Session | null>;
}

export interface ApiRequestContext {
  requestId: string;
  /** Explicit request preference; absent means the mailer keeps its configured default. */
  locale?: Locale;
  auth: ApiRequestAuthContext;
}

export function createApiRequestAuthContext(session: Session | null): ApiRequestAuthContext {
  return {
    session,
    user: session?.user ?? null,
  };
}
