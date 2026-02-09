/**
 * Default Authentication Routes Configuration
 *
 * These are the default auth routes used by the auth package.
 * Applications can override these by providing their own configuration.
 */

export const defaultAuthRoutes = {
  signIn: "/signin",
  signUp: "/signup",
  signOut: "/signout",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  verifyEmail: "/verify-email",
  magicLink: "/magic-link",
  emailOtp: "/email-otp",
  recoverAccount: "/recover-account",
} as const;

export type AuthRoutes = typeof defaultAuthRoutes;
