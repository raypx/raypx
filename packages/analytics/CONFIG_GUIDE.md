# Analytics Configuration Guide

This guide explains how to use the new configuration system for analytics.

## Overview

The analytics package now provides a unified configuration system that allows you to:
- Control all analytics tools from one place
- Override default configuration programmatically
- Access configuration anywhere in your app
- Enable/disable tools dynamically

## Basic Usage

### 1. Using Default Configuration (from Environment Variables)

```typescript
import { AnalyticsProvider } from "@raypx/analytics";

function App() {
  return (
    <AnalyticsProvider>
      {/* Your app content */}
    </AnalyticsProvider>
  );
}
```

This automatically reads configuration from environment variables:
- `VITE_PUBLIC_POSTHOG_KEY`
- `VITE_PUBLIC_GA_MEASUREMENT_ID`
- `VITE_PUBLIC_ENABLE_GA`
- `VITE_PUBLIC_ANALYTICS_DISABLED`
- `VITE_PUBLIC_ANALYTICS_DEBUG`
- `VITE_SENTRY_DSN`
- etc.

### 2. Custom Configuration

You can override or extend the default configuration:

```typescript
import { AnalyticsProvider, type AnalyticsConfig } from "@raypx/analytics";

function App() {
  const customConfig: Partial<AnalyticsConfig> = {
    debug: true, // Enable debug mode
    posthog: {
      enabled: true,
      autocapture: false, // Disable autocapture
      capturePageview: false, // Handle pageviews manually
    },
    ga: {
      enabled: false, // Disable GA even if configured
    },
  };

  return (
    <AnalyticsProvider config={customConfig}>
      {/* Your app content */}
    </AnalyticsProvider>
  );
}
```

### 3. Accessing Configuration in Components

```typescript
import { useAnalyticsConfig } from "@raypx/analytics";

function MyComponent() {
  const config = useAnalyticsConfig();

  return (
    <div>
      <p>Analytics enabled: {config.enabled ? "Yes" : "No"}</p>
      <p>PostHog enabled: {config.posthog.enabled ? "Yes" : "No"}</p>
      <p>Debug mode: {config.debug ? "Yes" : "No"}</p>
    </div>
  );
}
```

### 4. Using Analytics Hooks with Configuration

```typescript
import { useAnalytics, useAnalyticsConfig } from "@raypx/analytics";

function MyComponent() {
  const analytics = useAnalytics();
  const config = useAnalyticsConfig();

  const handleClick = () => {
    // The analytics.track() method automatically respects the configuration
    analytics.track("button_clicked", {
      button_name: "submit",
    });

    // Check configuration
    if (config.posthog.enabled) {
      console.log("Event sent to PostHog");
    }
    if (config.ga.enabled) {
      console.log("Event sent to Google Analytics");
    }
  };

  return <button onClick={handleClick}>Click Me</button>;
}
```

## Configuration Options

### Full Configuration Interface

```typescript
interface AnalyticsConfig {
  // Global settings
  enabled: boolean;
  debug: boolean;
  environment: "development" | "production";

  // PostHog settings
  posthog: {
    enabled: boolean;
    apiKey?: string;
    host?: string;
    ingestionUrl?: string;
    autocapture: boolean;
    capturePageview: boolean;
    capturePageleave: boolean;
    sessionRecording: {
      enabled: boolean;
      maskAllInputs: boolean;
      maskTextSelector?: string;
    };
  };

  // Google Analytics settings
  ga: {
    enabled: boolean;
    measurementId?: string;
  };

  // Vercel Analytics settings
  vercel: {
    enabled: boolean;
  };

  // Sentry settings
  sentry: {
    enabled: boolean;
    dsn?: string;
    enableInDev: boolean;
  };
}
```

## Advanced Usage Examples

### Conditional Analytics Based on User Preferences

```typescript
import { AnalyticsProvider } from "@raypx/analytics";
import { useState } from "react";

function App() {
  const [userPreferences, setUserPreferences] = useState({
    analytics: true,
    sessionRecording: false,
  });

  const analyticsConfig = {
    enabled: userPreferences.analytics,
    posthog: {
      sessionRecording: {
        enabled: userPreferences.sessionRecording,
      },
    },
  };

  return (
    <AnalyticsProvider config={analyticsConfig}>
      <Settings onPreferencesChange={setUserPreferences} />
      {/* Rest of your app */}
    </AnalyticsProvider>
  );
}
```

### Feature Flag-Based Configuration

```typescript
import { AnalyticsProvider, usePostHog } from "@raypx/analytics";

function App() {
  const posthog = usePostHog();
  const useNewAnalytics = posthog?.isFeatureEnabled("new-analytics");

  const config = {
    posthog: {
      autocapture: useNewAnalytics,
      capturePageview: useNewAnalytics,
    },
  };

  return (
    <AnalyticsProvider config={config}>
      {/* Your app */}
    </AnalyticsProvider>
  );
}
```

### Environment-Specific Configuration

```typescript
import { AnalyticsProvider, createAnalyticsConfig } from "@raypx/analytics";

function App() {
  const baseConfig = createAnalyticsConfig();
  
  // Override for staging environment
  const config = {
    ...baseConfig,
    debug: import.meta.env.MODE === "staging",
    posthog: {
      ...baseConfig.posthog,
      sessionRecording: {
        ...baseConfig.posthog.sessionRecording,
        enabled: import.meta.env.MODE !== "development",
      },
    },
  };

  return (
    <AnalyticsProvider config={config}>
      {/* Your app */}
    </AnalyticsProvider>
  );
}
```

## Benefits of New Configuration System

1. **Centralized Control**: All analytics configuration in one place
2. **Type Safety**: Full TypeScript support for configuration
3. **Runtime Flexibility**: Change configuration dynamically based on conditions
4. **Better Testing**: Easily mock or override configuration in tests
5. **Debugging**: Enable debug mode programmatically
6. **Consistency**: All analytics hooks respect the same configuration

## Migration from Old System

### Before (Environment Variables Only)

```typescript
// Configuration scattered across multiple files
// Hard to override dynamically
// No centralized control

<AnalyticsProvider>
  <App />
</AnalyticsProvider>
```

### After (Unified Configuration)

```typescript
// Centralized, type-safe configuration
// Easy to override
// Access anywhere with useAnalyticsConfig()

<AnalyticsProvider config={{ debug: true }}>
  <App />
</AnalyticsProvider>
```

## Best Practices

1. **Use environment variables for base configuration**
   - Set API keys and basic settings in `.env`
   - Use `config` prop only for overrides

2. **Enable debug mode in development**
   ```typescript
   const config = { debug: import.meta.env.DEV };
   ```

3. **Respect user privacy preferences**
   ```typescript
   const config = {
     enabled: userConsent.analytics,
     posthog: {
       sessionRecording: {
         enabled: userConsent.sessionRecording,
       },
     },
   };
   ```

4. **Use TypeScript for type safety**
   ```typescript
   import type { AnalyticsConfig } from "@raypx/analytics";
   
   const config: Partial<AnalyticsConfig> = {
     // TypeScript will validate your configuration
   };
   ```

## Troubleshooting

### Analytics not working?

Check configuration:
```typescript
const config = useAnalyticsConfig();
console.log("Config:", config);
```

### Want to see what events are being tracked?

Enable debug mode:
```typescript
<AnalyticsProvider config={{ debug: true }}>
```

### Need to disable analytics temporarily?

```typescript
<AnalyticsProvider config={{ enabled: false }}>
```

## Related Documentation

- [Main README](./README.md) - Complete package documentation
- [Environment Variables](./README.md#configuration) - Full list of env variables
- [API Reference](./README.md#api-reference) - All hooks and methods

