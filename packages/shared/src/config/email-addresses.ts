// ==================== Email Domain Configuration ====================

/** Email domain, retrieved from EMAIL_DOMAIN environment variable, defaults to raypx.com */
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || "raypx.com";

// ==================== Email Address Constants ====================

/** Email address configuration object */
export const EMAIL_ADDRESSES = {
  /** No-reply email address */
  NOREPLY: process.env.NOREPLY_EMAIL || `noreply@${EMAIL_DOMAIN}`,
  /** Hello email address */
  HELLO: process.env.HELLO_EMAIL || `hello@${EMAIL_DOMAIN}`,
  /** Support email address */
  SUPPORT: process.env.SUPPORT_EMAIL || `support@${EMAIL_DOMAIN}`,
  /** Test email address */
  TEST: process.env.TEST_EMAIL || `test@${EMAIL_DOMAIN}`,
} as const;

// ==================== Email Template Constants ====================

/** Email template configuration object */
export const EMAIL_TEMPLATES = {
  /** Default sender */
  DEFAULT_FROM: process.env.RESEND_FROM || `Raypx <${EMAIL_ADDRESSES.HELLO}>`,
  /** Support email sender */
  SUPPORT_FROM: `Raypx Support <${EMAIL_ADDRESSES.SUPPORT}>`,
  /** No-reply email sender */
  NOREPLY_FROM: `Raypx <${EMAIL_ADDRESSES.NOREPLY}>`,
} as const;

// ==================== Other Email Configuration ====================

/** Message ID domain, retrieved from MESSAGE_ID_DOMAIN environment variable, defaults to EMAIL_DOMAIN */
export const MESSAGE_ID_DOMAIN = process.env.MESSAGE_ID_DOMAIN || EMAIL_DOMAIN;

// ==================== Type Exports ====================

/** Email address type */
export type EmailAddress = (typeof EMAIL_ADDRESSES)[keyof typeof EMAIL_ADDRESSES];

/** Email template type */
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[keyof typeof EMAIL_TEMPLATES];
