import { useAnalytics } from "@raypx/analytics";
import { useEffect } from "react";

/**
 * Custom hook for tracking page views
 * Use this in route components to automatically track page views
 */
export function usePageTracking(pageName: string, properties?: Record<string, unknown>) {
  const analytics = useAnalytics();

  useEffect(() => {
    if (typeof window !== "undefined") {
      analytics.pageView(window.location.href, pageName);

      if (properties) {
        analytics.track("page_properties", {
          page: pageName,
          ...properties,
        });
      }
    }
  }, [analytics, pageName, properties]);
}

/**
 * Hook for tracking user actions
 */
export function useTrackAction() {
  const analytics = useAnalytics();

  return {
    trackClick: (element: string, properties?: Record<string, unknown>) => {
      analytics.track("click", { element, ...properties });
    },
    trackFormSubmit: (formName: string, properties?: Record<string, unknown>) => {
      analytics.track("form_submit", { form: formName, ...properties });
    },
    trackFeatureUse: (feature: string, properties?: Record<string, unknown>) => {
      analytics.trackFeatureUsage(feature, properties);
    },
  };
}

/**
 * Re-export useAnalytics for convenience
 */
export { useAnalytics };
