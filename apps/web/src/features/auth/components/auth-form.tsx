import { VerificationCode } from "./verification-code.js";
import { useRef, useState } from "react";
import { PasskeySignIn } from "./passkey-sign-in.js";
import { useTranslations } from "../../../i18n.js";
import { claimGuestDraft } from "../../tasks/guest-draft.js";
import { safeReturnTo } from "../return-to.js";

import { analytics } from "../../analytics/client.js";
import { Link, useLocation, useNavigate, useRouter, useRouteContext } from "@tanstack/react-router";
import {
  AuthForm as SharedAuthForm,
  type AuthFormLinkProps,
  type AuthMode,
} from "@raypx/auth/client";
import { apiUrl, authClient, webUrl } from "../client.js";
import { useQuery } from "@tanstack/react-query";
import type { SocialProvider } from "@raypx/core/auth";

function authLinkLocation(to: AuthFormLinkProps["to"], returnTo: string) {
  if (to === "account") return { to: returnTo };
  const destination = `/${to}` as const;
  if (returnTo === "/") return { to: destination, search: {} };
  return { to: destination, search: { returnTo } };
}

function signInDestination(search: string, returnTo: string) {
  if (new URLSearchParams(search).has("returnTo")) return returnTo;
  return "/projects";
}

function authCallbackURLs(returnTo: string) {
  if (returnTo === "/") return undefined;
  const destination = encodeURIComponent(returnTo);
  return {
    verify: `${webUrl}/verify-email?verified=1&returnTo=${destination}`,
    reset: `${webUrl}/reset-password?returnTo=${destination}`,
  };
}

function AuthLink({ to, className, children }: AuthFormLinkProps) {
  const search = useLocation({ select: (location) => location.searchStr });
  const returnTo = safeReturnTo(new URLSearchParams(search).get("returnTo"));
  return (
    <Link {...authLinkLocation(to, returnTo)} className={className}>
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
  const [challenge, setChallenge] = useState(false);
  const search = useLocation({ select: (location) => location.searchStr });
  const returnTo = safeReturnTo(new URLSearchParams(search).get("returnTo"));
  const providers = useQuery({
    queryKey: ["auth", "social-providers", apiUrl],
    queryFn: async ({ signal }) => {
      const result = await authClient.$fetch<{
        providers: SocialProvider[];
        turnstileSiteKey?: string;
      }>("/social-providers", {
        signal,
      });
      if (result.error || !result.data) throw new Error("Login providers unavailable");
      return result.data;
    },
    staleTime: 60_000,
    enabled: mode === "login" || mode === "signup",
  });
  const signedInDestination = signInDestination(search, returnTo);
  const oauthDestination = encodeURIComponent(signedInDestination);
  async function onSignedIn() {
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
      to: signedInDestination,
    });
  }
  if (mode === "login" && challenge)
    return <VerificationCode onSignedIn={onSignedIn} onCancel={() => setChallenge(false)} />;
  return (
    <SharedAuthForm
      key={mode}
      mode={completeSignIn ? "login" : mode}
      completeOnMount={completeSignIn}
      backLabel={g("back")}
      client={authClient}
      onTwoFactorRequired={() => setChallenge(true)}
      webUrl={webUrl}
      search={search}
      callbackURLs={authCallbackURLs(returnTo)}
      socialLogin={{
        providers: providers.data?.providers ?? [],
        callbackURL: `${webUrl}/login?oauth=success&returnTo=${oauthDestination}`,
        errorCallbackURL: `${webUrl}/login?returnTo=${oauthDestination}`,
      }}
      onSignedIn={onSignedIn}
      renderSignInAlternatives={(busy) => (
        <>
          <PasskeySignIn onSignedIn={onSignedIn} disabled={busy} />
          {providers.data && (
            <VerificationCode
              email
              onSignedIn={onSignedIn}
              disabled={busy}
              {...(providers.data.turnstileSiteKey
                ? { turnstileSiteKey: providers.data.turnstileSiteKey }
                : {})}
            />
          )}
        </>
      )}
      LinkComponent={AuthLink}
    />
  );
}
