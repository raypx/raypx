import type { FC, ReactNode } from "react";
import { AnalyticsConfigProvider, useAnalyticsConfig } from "./context";
import { PostHogProvider } from "./posthog/provider";

/**
 * Internal provider that uses the config
 */
const AnalyticsProviderInner: FC<{ children: ReactNode }> = ({ children }) => {
  return <PostHogProvider>{children}</PostHogProvider>;
};

/**
 * Main analytics provider
 * Wraps children with analytics configuration and providers
 */
import type { AnalyticsConfig } from "./config";

export const AnalyticsProvider: FC<{
  children: ReactNode;
  config?: Partial<AnalyticsConfig>;
}> = ({ children, config }) => {
  return (
    <AnalyticsConfigProvider config={config}>
      <AnalyticsProviderInner>{children}</AnalyticsProviderInner>
    </AnalyticsConfigProvider>
  );
};

// Export additional providers and hooks for advanced usage
export { PostHogProvider, AnalyticsConfigProvider, useAnalyticsConfig };
