import { Button } from "@raypx/ui/components/button";
import { Icon } from "@raypx/ui/components/icon";
import { cn } from "@raypx/ui/lib/utils";
import type { SocialProvider } from "better-auth/social-providers";
import { useCallback } from "react";
import { logger } from "../../logger";
import { useAuth } from "../hooks/use-auth";
import type { Provider } from "../utils/social-providers";

type ProviderButtonProps = {
  className?: string;
  provider: Provider;
  redirectTo?: string;
  callbackURL?: string;
  layout?: "auto" | "horizontal" | "grid" | "vertical";
  disabled?: boolean;
};

export function ProviderButton({
  className,
  provider,
  redirectTo: redirectToProp,
  callbackURL: callbackURLProp,
  layout = "vertical",
  disabled = false,
}: ProviderButtonProps) {
  const { auth, redirectTo: contextRedirectTo } = useAuth();

  const getRedirectTo = useCallback(() => {
    if (typeof window === "undefined") return redirectToProp || contextRedirectTo;
    const searchParam = new URLSearchParams(window.location.search).get("redirectTo");
    return redirectToProp || searchParam || contextRedirectTo;
  }, [redirectToProp, contextRedirectTo]);

  const getCallbackURL = useCallback(() => {
    if (callbackURLProp) return callbackURLProp;
    return getRedirectTo();
  }, [callbackURLProp, getRedirectTo]);

  const doSignInSocial = async () => {
    try {
      await auth.signIn.social({
        provider: provider.provider as SocialProvider,
        callbackURL: getCallbackURL(),
        fetchOptions: { throw: true },
      });
    } catch (error) {
      logger.error("Social sign in error", { error });
    }
  };

  return (
    <Button
      className={cn(layout === "vertical" ? "w-full" : "grow", className)}
      disabled={disabled}
      onClick={doSignInSocial}
      type="button"
      variant="outline"
    >
      {provider.icon && <Icon className="mr-2 size-4" icon={provider.icon} />}
      {layout === "grid" && provider.name}
      {layout === "vertical" && `Sign in with ${provider.name}`}
    </Button>
  );
}
