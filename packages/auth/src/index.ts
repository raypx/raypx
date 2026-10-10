/**
 * @raypx/auth - Authentication and session management
 *
 * Provides Better Auth integration with Drizzle adapter, redirect validation,
 * and session management utilities.
 */

// Core adapter and types
export {
  createAuth,
  type CreateAuthOptions,
  type AuthInstance,
  type AuthSession,
} from "./adapter.js";

// Session management
export { configureAuth, getAuth, auth, getSession, requireAuth } from "./session.js";

// Validation utilities
export { parseOrigin, validateRequestRedirects } from "./validation.js";

// Re-export Better Auth types
export type { Session, User } from "better-auth/types";
