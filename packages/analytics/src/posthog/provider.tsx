import { PostHogProvider as PostHogReactProvider } from "@posthog/react";
import type { FC, ReactNode } from "react";
import { useEffect, useState } from "react";
import { envs } from "../envs";
import { initPostHog } from "./init";

export const PostHogProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [client, setClient] = useState<ReturnType<typeof initPostHog>>(null);
  const env = envs();

  useEffect(() => {
    // Only initialize on client side
    if (
      typeof window === "undefined" ||
      (!import.meta.env.PROD && !env.VITE_PUBLIC_ANALYTICS_DEBUG) ||
      env.VITE_PUBLIC_ANALYTICS_DISABLED
    ) {
      return;
    }

    const posthogInstance = initPostHog();
    console.log("posthogInstance", posthogInstance);
    setClient(posthogInstance);

    // Cleanup on unmount
    return () => {
      if (posthogInstance) {
        // PostHog doesn't have a destroy method, but we can reset
        posthogInstance.reset();
      }
    };
  }, [env]);

  // If no client, just render children without provider
  if (!client) {
    return <>{children}</>;
  }

  return <PostHogReactProvider client={client}>{children}</PostHogReactProvider>;
};
