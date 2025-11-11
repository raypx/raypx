import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "./use-auth";

type UseAuthenticateOptions = {
  redirectTo: string;
};

export function useAuthenticate({ redirectTo }: UseAuthenticateOptions) {
  const navigate = useNavigate();
  const {
    hooks: { useSession },
  } = useAuth();

  const { data, isPending, error, refetch } = useSession();
  const sessionData = data;

  useEffect(() => {
    if (isPending || sessionData) return;

    const currentUrl = new URL(window.location.href);
    const from =
      currentUrl.searchParams.get("redirectTo") ||
      window.location.href.replace(window.location.origin, "");

    navigate({
      to: redirectTo,
      params: {
        redirectTo: encodeURIComponent(from),
      },
      replace: true,
    });
  }, [isPending, sessionData]);

  return {
    data: sessionData,
    user: sessionData?.user,
    isPending,
    error,
    refetch,
  };
}
