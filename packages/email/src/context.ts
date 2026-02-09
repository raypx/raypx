import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Email sending context
 * Passed through the async call chain for tracking and dynamic provider selection
 */
export interface EmailContext {
  /**
   * Request/Trace ID for logging and debugging
   */
  requestId?: string;

  /**
   * User ID who triggered the email send
   */
  userId?: string;

  /**
   * Tenant ID (for multi-tenant systems)
   */
  tenantId?: string;

  /**
   * Force a specific provider for this context
   * Overrides both environment variable and call-time provider
   */
  provider?: string;

  /**
   * Additional metadata for logging
   */
  metadata?: Record<string, unknown>;
}

/**
 * Async local storage for email context
 * Maintains context throughout the async call chain
 */
const emailContextStorage = new AsyncLocalStorage<EmailContext>();

/**
 * Set the email context for the current async call chain
 *
 * @example
 * ```ts
 * await withEmailContext({ requestId: "req-123", userId: "user-456" }, async () => {
 *   await sendEmail({...}); // Will automatically include context
 * });
 * ```
 */
export async function withEmailContext<T>(
  context: EmailContext,
  callback: () => Promise<T>,
): Promise<T> {
  return emailContextStorage.run(context, callback);
}

/**
 * Get the current email context
 * Returns undefined if no context is set
 */
export function getEmailContext(): EmailContext | undefined {
  return emailContextStorage.getStore();
}

/**
 * Run a function with a specific provider override
 *
 * @example
 * ```ts
 * await withEmailProvider("resend", async () => {
 *   await sendEmail({...}); // Will use resend
 * });
 * ```
 */
export async function withEmailProvider<T>(
  provider: string,
  callback: () => Promise<T>,
): Promise<T> {
  const currentContext = getEmailContext();
  return withEmailContext({ ...currentContext, provider }, callback);
}

/**
 * Run a function with a specific tenant context
 * Useful for multi-tenant systems where different tenants use different providers
 *
 * @example
 * ```ts
 * await withTenantContext("tenant-123", async () => {
 *   await sendEmail({...}); // Will use tenant's configured provider
 * });
 * ```
 */
export async function withTenantContext<T>(
  tenantId: string,
  callback: () => Promise<T>,
): Promise<T> {
  const currentContext = getEmailContext();
  return withEmailContext({ ...currentContext, tenantId }, callback);
}

/**
 * Merge context with additional metadata
 */
export function mergeEmailContext(additionalContext: Partial<EmailContext>): EmailContext {
  const currentContext = getEmailContext();
  return {
    ...currentContext,
    ...additionalContext,
  };
}
