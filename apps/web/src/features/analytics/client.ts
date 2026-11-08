import { createRaypxAnalytics } from "@raypx/analytics/browser";
const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN ?? "";
const host = import.meta.env.VITE_POSTHOG_HOST ?? "";
export const analyticsConfigured = Boolean(token && host && import.meta.env.VITE_APP_RELEASE);
export const analytics = createRaypxAnalytics({
  token,
  host,
  release: import.meta.env.VITE_APP_RELEASE ?? "",
  environment: import.meta.env.MODE,
  surface: "web",
});
