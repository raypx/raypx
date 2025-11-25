# @raypx/analytics

Business analytics toolkit with multiple analytics platforms for product insights and user behavior tracking.

> **Note:** For error monitoring and system observability, use [`@raypx/observability`](../observability/README.md) instead.

## 🚀 Integrated Tools

### Active Tools

| Tool | Purpose | Status |
|------|---------|--------|
| **PostHog** | Product analytics, user behavior tracking, A/B testing | ✅ Enabled |
| **Vercel Analytics** | Basic traffic, performance monitoring (privacy-friendly) | ✅ Enabled |

### Optional Tools

| Tool | Purpose | Status |
|------|---------|--------|
| **Google Analytics** | Marketing analysis, traffic attribution, ad tracking | ⚠️ Configured, disabled by default |

## 📦 Installation

```bash
pnpm add @raypx/analytics
```

## 🔧 Configuration

### Environment Variables

Configure in your `.env` file:

```bash
# ===== PostHog Product Analytics =====
VITE_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxx
VITE_PUBLIC_POSTHOG_HOST=https://app.posthog.com
VITE_PUBLIC_POSTHOG_INGESTION_URL=https://app.posthog.com

# ===== Google Analytics (Optional, disabled by default) =====
VITE_PUBLIC_ENABLE_GA=false  # Set to true to enable GA
VITE_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# ===== Global Controls =====
VITE_PUBLIC_ANALYTICS_DISABLED=false  # Disable all analytics
VITE_PUBLIC_ANALYTICS_DEBUG=false     # Debug mode in development
```

## 📖 Usage

### PostHog Product Analytics

**Setup in your app:**

```typescript
import { AnalyticsProvider } from "@raypx/analytics";

// In your root component
function App() {
  return (
    <AnalyticsProvider>
      {/* Your app content */}
    </AnalyticsProvider>
  );
}
```

**Use the unified `useAnalytics()` hook:**

```typescript
import { useAnalytics } from "@raypx/analytics";

function MyComponent() {
  const analytics = useAnalytics();

  // Track events
  const handleClick = () => {
    analytics.track("button_clicked", {
      button_name: "signup",
      location: "homepage",
    });
  };

  // Identify user
  const handleLogin = (userId: string) => {
    analytics.identify(userId, {
      email: "user@example.com",
      plan: "pro",
    });
  };

  // Track page views
  useEffect(() => {
    analytics.pageView(window.location.href, "Home Page");
  }, []);

  return <button onClick={handleClick}>Sign Up</button>;
}
```

**Direct PostHog access (advanced):**

```typescript
import { usePostHog } from "@raypx/analytics";

function MyComponent() {
  const posthog = usePostHog();
  
  // Use PostHog directly for advanced features
  posthog?.isFeatureEnabled("new-feature");
}
```

### 3. Vercel Analytics

Automatically integrated in root component, no extra configuration needed:

```typescript
import { Analytics } from "@raypx/analytics";

// In __root.tsx
{process.env.NODE_ENV === "production" && <Analytics />}
```

## 🎯 Advanced Usage

### AI Interaction Tracking

```typescript
const analytics = useAnalytics();

analytics.trackAIInteraction("chat_message", {
  model: "gpt-4",
  tokens: 150,
  latency: 1200,
  success: true,
});
```

### Feature Usage Tracking

```typescript
analytics.trackFeatureUsage("export_pdf", {
  format: "pdf",
  size: "A4",
});
```

### User Action Tracking

```typescript
analytics.trackUserAction("file_upload", "documents", {
  file_type: "pdf",
  file_size: 1024 * 1024, // 1MB
});
```

### Group Tracking (PostHog)

```typescript
// Track organization-level data
analytics.group("company", "company_123", {
  name: "Acme Inc",
  plan: "enterprise",
});
```

### Feature Flags (PostHog)

```typescript
import { usePostHog } from "@raypx/analytics";

function MyComponent() {
  const posthog = usePostHog();
  
  // Check if a feature is enabled
  const isNewUIEnabled = posthog?.isFeatureEnabled("new-ui");
  
  // Get feature flag value with fallback
  const theme = posthog?.getFeatureFlag("theme") || "light";
  
  return (
    <div>
      {isNewUIEnabled ? <NewUI /> : <OldUI />}
      <div className={theme}>Content</div>
    </div>
  );
}
```

### Session Recording (PostHog)

```typescript
import { usePostHog } from "@raypx/analytics";

function MyComponent() {
  const posthog = usePostHog();
  
  // Start recording
  posthog?.startSessionRecording();
  
  // Stop recording
  posthog?.stopSessionRecording();
  
  // Check if recording is active
  const isRecording = posthog?.sessionRecordingStarted();
}
```

## 🔐 Privacy and Compliance

- **PostHog**: Self-hosting supported, full data control
- **Vercel Analytics**: No cookies, fully anonymous
- **Google Analytics**: Disabled by default, enable when needed (consider GDPR compliance)

> **Note:** For error monitoring and privacy controls, see [`@raypx/observability`](../observability/README.md)

## 🎚️ Tool Selection Guide

### Current Recommended Configuration (Default)

```
✅ PostHog - Product analytics and user behavior
✅ Vercel Analytics - Lightweight performance monitoring
❌ Google Analytics - Disabled by default
```

> **Note:** For error monitoring, use [`@raypx/observability`](../observability/README.md) with Sentry

### When to Enable Google Analytics

Enable if you need:
- Google Ads integration
- Detailed traffic source analysis
- Marketing attribution and conversion tracking
- E-commerce tracking and revenue reports

Enable by setting environment variable:
```bash
VITE_PUBLIC_ENABLE_GA=true
```

### Tool Feature Comparison

| Feature | Sentry | PostHog | GA4 | Vercel Analytics |
|---------|--------|---------|-----|------------------|
| Error Monitoring | ✅ | ❌ | ❌ | ❌ |
| Performance Tracking | ✅ | ⚠️ | ⚠️ | ✅ |
| Session Replay | ✅ | ✅ | ❌ | ❌ |
| User Behavior | ❌ | ✅ | ✅ | ⚠️ |
| A/B Testing | ❌ | ✅ | ⚠️ | ❌ |
| Funnel Analysis | ❌ | ✅ | ✅ | ❌ |
| Self-Hosting | ⚠️ | ✅ | ❌ | ❌ |
| Privacy-Friendly | ✅ | ✅ | ⚠️ | ✅ |

## 🐛 Debugging

### Development Mode

Enable debugging in development to see all analytics events in console:

```bash
# Enable debug mode (logs all events in development)
VITE_PUBLIC_ANALYTICS_DEBUG=true
```

### Working Without PostHog Key

The analytics package is designed to work gracefully without PostHog configured:

**✅ What happens:**
- PostHog initialization is skipped with a warning
- All `analytics.track()` calls work without errors
- Events are logged in debug mode but not sent
- Google Analytics and Vercel Analytics still work if configured

**🔧 Debug mode without keys:**
```bash
# See what events would be tracked
VITE_PUBLIC_ANALYTICS_DEBUG=true
```

This will log:
```
[PostHog] API key not configured, skipping initialization
[Analytics] Track: button_clicked { location: 'navbar' }
[Analytics] PostHog not initialized, event not sent: button_clicked
```

**No configuration required** - you can start using analytics hooks immediately and add keys later when ready for production.

## 📚 API Reference

### `useAnalytics()`

Returns an object with the following methods:

| Method | Parameters | Description |
|--------|-----------|-------------|
| `track` | `(event, properties?)` | Track custom events |
| `identify` | `(userId, properties?)` | Identify user |
| `reset` | `()` | Reset user session |
| `pageView` | `(url?, title?)` | Track page views |
| `setPersonProperties` | `(properties)` | Set user properties |
| `group` | `(type, key, properties?)` | Group tracking |
| `trackAIInteraction` | `(action, metadata?)` | Track AI interactions |
| `trackFeatureUsage` | `(feature, properties?)` | Track feature usage |
| `trackUserAction` | `(action, context?, properties?)` | Track user actions |

## 🔗 Related Links

- [PostHog Documentation](https://posthog.com/docs)
- [Google Analytics Documentation](https://developers.google.com/analytics)
- [Vercel Analytics Documentation](https://vercel.com/docs/analytics)
- [`@raypx/observability`](../observability/README.md) - Error monitoring with Sentry

## 📝 License

MIT

