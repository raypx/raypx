/**
 * Example component demonstrating PostHog/Analytics integration
 *
 * This file shows various ways to use analytics in your components.
 * You can delete this file after understanding the usage patterns.
 */

import { usePostHog } from "@raypx/analytics";
import { Button } from "@raypx/ui/components/button";
import { usePageTracking, useTrackAction } from "@/hooks/useTracking";

export function AnalyticsExample() {
  // Method 1: Use custom tracking hooks
  usePageTracking("Analytics Example Page", {
    section: "examples",
  });

  const { trackClick, trackFeatureUse } = useTrackAction();

  // Method 2: Direct PostHog access for advanced features
  const posthog = usePostHog();

  const handleButtonClick = () => {
    // Track click event
    trackClick("example_button", {
      action: "clicked",
      location: "example_page",
    });
  };

  const handleFeatureUse = () => {
    // Track feature usage
    trackFeatureUse("advanced_feature", {
      feature_type: "example",
    });
  };

  const handleFeatureFlagCheck = () => {
    // Check feature flag (PostHog only)
    const isEnabled = posthog?.isFeatureEnabled("new-ui");
    // In production, use this value to conditionally render features
    return isEnabled;
  };

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Analytics Integration Example</h1>

      <div className="space-y-2">
        <p className="text-muted-foreground">
          This page demonstrates different ways to use analytics in your components.
        </p>

        <div className="flex gap-2">
          <Button onClick={handleButtonClick}>Track Click Event</Button>

          <Button onClick={handleFeatureUse} variant="outline">
            Track Feature Usage
          </Button>

          <Button onClick={handleFeatureFlagCheck} variant="secondary">
            Check Feature Flag
          </Button>
        </div>
      </div>

      <div className="mt-8 p-4 bg-muted rounded-lg">
        <h2 className="font-semibold mb-2">Available Tracking Methods:</h2>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>
            <code>usePageTracking()</code> - Auto track page views
          </li>
          <li>
            <code>useTrackAction()</code> - Track user actions
          </li>
          <li>
            <code>useAnalytics()</code> - Full analytics API
          </li>
          <li>
            <code>usePostHog()</code> - Direct PostHog access
          </li>
        </ul>
      </div>
    </div>
  );
}
