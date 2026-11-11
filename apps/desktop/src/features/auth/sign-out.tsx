import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useAuthActions, type AuthActionResult } from "@raypx/auth/hooks";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "@raypx/i18n/browser";
import { useDesktopPlatform } from "../../lib/platform-context.tsx";
import { analytics } from "../analytics/client.ts";
import { signOutDesktopHost } from "../tasks/host-session.ts";
import { authClient, webUrl } from "./client.ts";

interface SignOutState {
  busy: boolean;
  error: ReturnType<typeof useAuthActions>["error"];
  clearError(): void;
  signOut(accountId: string | null, destination?: "/" | "/login"): Promise<AuthActionResult>;
}
const SignOutContext = createContext<SignOutState | null>(null);

/** Keep explicit logout cleanup alive across route, session and engine-gate changes. */
export function DesktopSignOutProvider({ children }: { children: ReactNode }) {
  const auth = useAuthActions({ client: authClient, webUrl });
  const platform = useDesktopPlatform();
  const queries = useQueryClient();
  const router = useRouter();
  const c = useTranslations("common");
  const { error, retryCompletion } = auth;
  useEffect(() => {
    // Recovery can arrive before React renders the failure. The auth action
    // retries only when it has retained an unfinished cleanup callback.
    const retry = () => void retryCompletion();
    const stop = platform.onLocalEvent((event) => {
      if (event.event === "engine.status" && event.data.status === "ready") retry();
    });
    window.addEventListener("online", retry);
    return () => {
      stop();
      window.removeEventListener("online", retry);
    };
  }, [platform, retryCompletion]);
  const state: SignOutState = {
    busy: auth.busy,
    error,
    clearError: () => {
      if (error?.kind !== "completion") auth.clearError();
    },
    signOut: (accountId, destination) => {
      if (error?.kind === "completion") return retryCompletion();
      return auth.signOut(async () => {
        analytics.reset();
        if (accountId)
          queries.removeQueries({ predicate: (query) => query.queryKey.includes(accountId) });
        await signOutDesktopHost(platform);
        await queries.invalidateQueries({ queryKey: ["instance"] });
        await router.invalidate();
        if (destination)
          await router.navigate({
            to: destination,
            ...(destination === "/" ? { replace: true } : {}),
          });
      });
    },
  };
  return (
    <SignOutContext value={state}>
      {children}
      {error?.kind === "completion" && (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-lg border border-border bg-background p-4 text-sm shadow-lg"
        >
          <p className="flex-1">{c("signOutIncomplete")}</p>
          <Button disabled={auth.busy} onClick={() => void retryCompletion()}>
            {c("retry")}
          </Button>
        </div>
      )}
    </SignOutContext>
  );
}

export function useDesktopSignOut() {
  const state = useContext(SignOutContext);
  if (!state) throw new Error("DesktopSignOutProvider is required");
  return state;
}
