/**
 * Authentication Routes Configuration
 *
 * Centralized configuration for all auth-related routes.
 * Update these paths to change routes across the entire application.
 *
 * Extends the default routes from @raypx/auth package.
 * You can override any route path here if needed.
 */

import { defaultAuthRoutes } from "@raypx/auth";

/**
 * Auth route paths
 * These extend the default routes from the auth package
 */
export const authRoutes = {
  ...defaultAuthRoutes,
  // Override specific routes here if needed
  // Example: signIn: "/login",
} as const;

/**
 * Default redirect paths after auth actions
 */
export const authRedirects = {
  afterSignIn: "/dashboard",
  afterSignUp: "/dashboard",
  afterSignOut: "/auth/signin",
  afterPasswordReset: "/auth/signin",
} as const;

/**
 * Auth-related configuration
 */
export const authConfig = {
  routes: authRoutes,
  redirects: authRedirects,
} as const;
