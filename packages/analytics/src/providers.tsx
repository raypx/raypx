import { Analytics } from "@vercel/analytics/react";
import type { FC, ReactNode } from "react";
import { envs } from "./envs";
import { PostHogProvider } from "./posthog/provider";

export const AnalyticsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const env = envs();
  return (
    <PostHogProvider>
      {children}
      {env.NODE_ENV === "production" && <Analytics />}
    </PostHogProvider>
  );
};

// Export PostHog Provider separately for advanced usage
export { PostHogProvider };
