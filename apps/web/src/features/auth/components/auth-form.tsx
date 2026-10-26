import { claimGuestDraft } from "../../tasks/guest-draft";
import { safeReturnTo } from "../return-to";
import { useTranslations } from "@raypx/i18n/browser";
import { analytics } from "../../analytics/client";
import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import {
  AuthForm as SharedAuthForm,
  type AuthFormLinkProps,
  type AuthMode,
} from "@raypx/auth/client";
import { apiUrl, authClient, webUrl } from "../client";

function AuthLink({ to, className, children }: AuthFormLinkProps) {
  const search = useLocation({ select: (location) => location.searchStr });
  const returnTo = safeReturnTo(new URLSearchParams(search).get("returnTo"));
  return (
    <Link
      to={to === "account" ? returnTo : `/${to}`}
      {...(to === "account" ? {} : { search: returnTo === "/" ? {} : { returnTo } })}
      className={className}
    >
      {children}
    </Link>
  );
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const g = useTranslations("guest");
  const router = useRouter();
  const navigate = useNavigate();
  const search = useLocation({ select: (location) => location.searchStr });
  const returnTo = safeReturnTo(new URLSearchParams(search).get("returnTo"));
  const destination = encodeURIComponent(returnTo);
  const callbackURLs =
    returnTo === "/"
      ? undefined
      : {
          verify: `${webUrl}/verify-email?verified=1&returnTo=${destination}`,
          reset: `${webUrl}/reset-password?returnTo=${destination}`,
        };
  return (
    <SharedAuthForm
      key={mode}
      mode={mode}
      backLabel={g("back")}
      client={authClient}
      webUrl={webUrl}
      search={search}
      callbackURLs={callbackURLs}
      onSignedIn={async () => {
        analytics.capture("sign_in_succeeded");
        const session = await authClient.getSession({
          fetchOptions: { signal: AbortSignal.timeout(10_000) },
        });
        if (session.data) {
          try {
            claimGuestDraft(apiUrl, session.data.user.id);
          } catch {
            /* A failed handoff remains recoverable in the original tab. */
          }
        }
        router.options.context.queryClient.clear();
        await router.invalidate();
        await navigate({ to: returnTo });
      }}
      LinkComponent={AuthLink}
    />
  );
}
