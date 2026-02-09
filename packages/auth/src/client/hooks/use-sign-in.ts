import { useNavigate } from "@tanstack/react-router";
import type { BetterFetchOption } from "better-auth/client";
import { useCallback } from "react";
import { isValidEmail } from "../utils/email";
import { useAuth } from "./use-auth";
import { useOnSuccessTransition } from "./use-success-transition";

export type UseSignInOptions = {
  redirectTo?: string;
  onError?: (error: unknown) => void;
  onTwoFactorRedirect?: (redirectTo?: string) => void | Promise<void>;
};

/**
 * Hook for handling sign-in logic with support for username/email and two-factor authentication
 */
export function useSignIn(options: UseSignInOptions = {}) {
  const { redirectTo: contextRedirectTo, credentials, auth } = useAuth();
  const navigate = useNavigate();
  const { onSuccess } = useOnSuccessTransition({
    redirectTo: options.redirectTo || contextRedirectTo,
  });

  const usernameEnabled = credentials?.username;
  const redirectTo = options.redirectTo || contextRedirectTo;

  const signIn = useCallback(
    async ({
      email,
      password,
      rememberMe,
    }: {
      email: string;
      password: string;
      rememberMe?: boolean;
    }) => {
      try {
        let response: Record<string, unknown> = {};

        if (usernameEnabled && !isValidEmail(email)) {
          const fetchOptions: BetterFetchOption = {
            throw: true,
          };

          response = await auth.signIn.username({
            username: email,
            password,
            rememberMe,
            fetchOptions,
          });
        } else {
          const fetchOptions: BetterFetchOption = {
            throw: true,
          };

          response = await auth.signIn.email({
            email,
            password,
            rememberMe,
            fetchOptions,
          });
        }

        if (response.twoFactorRedirect) {
          if (options.onTwoFactorRedirect) {
            await options.onTwoFactorRedirect(redirectTo);
          } else {
            await navigate({
              to: "/two-factor",
              search: { redirectTo },
              replace: true,
            });
          }
        } else {
          await onSuccess();
        }
      } catch (error) {
        options.onError?.(error);
        throw error;
      }
    },
    [usernameEnabled, auth, navigate, redirectTo, onSuccess, options],
  );

  return { signIn };
}
