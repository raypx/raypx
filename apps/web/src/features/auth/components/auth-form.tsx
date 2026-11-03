import { claimGuestDraft } from "../../tasks/guest-draft";
import { safeReturnTo } from "../return-to";
import { useTranslations } from "@raypx/i18n/browser";
import { analytics } from "../../analytics/client";
import { Link, useLocation, useNavigate, useRouter, useRouteContext } from "@tanstack/react-router";
import {
  AuthForm as SharedAuthForm,
  type AuthFormLinkProps,
  type AuthMode,
} from "@raypx/auth/client";
import { apiUrl, authClient, webUrl } from "../client";
import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SocialProvider } from "@raypx/auth/types";

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
  const { completeSignIn } = useRouteContext({ from: "/(auth)" });
  const g = useTranslations("guest");
  const router = useRouter();
  const navigate = useNavigate();
  const signInReported = useRef(false);
  const search = useLocation({ select: (location) => location.searchStr });
  const returnTo = safeReturnTo(new URLSearchParams(search).get("returnTo"));
  const destination = encodeURIComponent(returnTo);
  const providers = useQuery({
    queryKey: ["auth", "social-providers", apiUrl],
    queryFn: async ({ signal }) => {
      const result = await authClient.$fetch<{ providers: SocialProvider[] }>("/social-providers", {
        signal,
      });
      if (result.error || !result.data) throw new Error("Login providers unavailable");
      return result.data.providers;
    },
    staleTime: 60_000,
    enabled: mode === "login" || mode === "signup",
  });
  const oauthReturnTo = new URLSearchParams(search).has("returnTo") ? returnTo : "/projects";
  const oauthDestination = encodeURIComponent(oauthReturnTo);
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
      mode={completeSignIn ? "login" : mode}
      completeOnMount={completeSignIn}
      backLabel={g("back")}
      client={authClient}
      webUrl={webUrl}
      search={search}
      callbackURLs={callbackURLs}
      socialLogin={{
        providers: providers.data ?? [],
        callbackURL: `${webUrl}/login?oauth=success&returnTo=${oauthDestination}`,
        errorCallbackURL: `${webUrl}/login?returnTo=${oauthDestination}`,
      }}
      onSignedIn={async () => {
        if (!signInReported.current) {
          analytics.capture("sign_in_succeeded");
          signInReported.current = true;
        }
        const session = await authClient.getSession({
          fetchOptions: { signal: AbortSignal.timeout(10_000) },
        });
        if (session.error || !session.data) throw new Error("Session refresh failed");
        try {
          claimGuestDraft(apiUrl, session.data.user.id);
        } catch {
          /* A failed handoff remains recoverable in the original tab. */
        }
        router.options.context.queryClient.clear();
        await navigate({
          to: new URLSearchParams(search).has("returnTo") ? returnTo : "/projects",
        });
      }}
      LinkComponent={AuthLink}
    />
  );
}
