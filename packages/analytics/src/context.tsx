import type { FC, ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";
import type { AnalyticsConfig } from "./config";
import { createAnalyticsConfig, defaultAnalyticsConfig } from "./config";

/**
 * Analytics configuration context
 */
const AnalyticsConfigContext = createContext<AnalyticsConfig>(defaultAnalyticsConfig);

/**
 * Hook to access analytics configuration
 */
export function useAnalyticsConfig(): AnalyticsConfig {
  return useContext(AnalyticsConfigContext);
}

/**
 * Analytics configuration provider
 * Provides analytics configuration to all child components
 */
export const AnalyticsConfigProvider: FC<{
  children: ReactNode;
  config?: Partial<AnalyticsConfig>;
}> = ({ children, config: customConfig }) => {
  const config = useMemo(() => {
    const baseConfig = createAnalyticsConfig();

    // Merge custom config if provided
    if (customConfig) {
      return {
        ...baseConfig,
        ...customConfig,
        posthog: {
          ...baseConfig.posthog,
          ...customConfig.posthog,
        },
        ga: {
          ...baseConfig.ga,
          ...customConfig.ga,
        },
      };
    }

    return baseConfig;
  }, [customConfig]);

  return (
    <AnalyticsConfigContext.Provider value={config}>{children}</AnalyticsConfigContext.Provider>
  );
};
