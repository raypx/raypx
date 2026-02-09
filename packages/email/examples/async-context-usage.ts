/**
 * AsyncContext Usage Examples
 *
 * Demonstrates how to use AsyncContext for advanced email sending scenarios
 */

import {
  type EmailContext,
  getEmailContext,
  sendEmail,
  withEmailContext,
  withEmailProvider,
  withTenantContext,
} from "@raypx/email";

// ============================================
// Example 1: Request Tracking
// ============================================

async function handleRequestWithTracking() {
  // Simulate a request with a unique ID
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await withEmailContext({ requestId }, async () => {
    // All email sends in this scope will have the requestId
    await sendEmail({
      to: "user@example.com",
      from: "noreply@example.com",
      subject: "Welcome",
      template: "<div>Welcome!</div>",
    });
    // Logs: [Email] Sending email with requestId: req-123, provider: nodemailer

    // Even in nested async calls, context is preserved
    await sendNestedEmails();
  });
}

async function sendNestedEmails() {
  // Context is automatically preserved!
  await sendEmail({
    to: "user2@example.com",
    from: "noreply@example.com",
    subject: "Follow-up",
    template: "<div>Follow-up email</div>",
  });
  // Logs: [Email] Sending email with requestId: req-123, provider: nodemailer
}

// ============================================
// Example 2: Multi-Tenant System
// ============================================

// Tenant configuration
const tenantConfigs: Record<string, { provider: string; from: string }> = {
  tenant1: { provider: "resend", from: "noreply@tenant1.com" },
  tenant2: { provider: "sendgrid", from: "noreply@tenant2.com" },
  tenant3: { provider: "nodemailer", from: "noreply@tenant3.com" },
};

async function handleTenantRequest(tenantId: string, userEmail: string) {
  const config = tenantConfigs[tenantId];

  await withEmailContext({ tenantId, provider: config.provider }, async () => {
    // This email will use tenant's configured provider
    await sendEmail({
      to: userEmail,
      from: config.from,
      subject: "Tenant-specific email",
      template: `<div>Email from ${tenantId}</div>`,
    });

    // All subsequent emails in this scope use the same provider
    await sendMoreTenantEmails(userEmail);
  });
}

async function sendMoreTenantEmails(userEmail: string) {
  // Still using tenant's provider from context!
  await sendEmail({
    to: userEmail,
    from: "noreply@example.com",
    subject: "Another tenant email",
    template: "<div>More tenant content</div>",
  });
}

// ============================================
// Example 3: Provider Override
// ============================================

async function sendWithProviderOverride() {
  // Default provider from env
  await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Default provider",
    template: "<div>Using default provider</div>",
  });

  // Override for specific scope
  await withEmailProvider("resend", async () => {
    await sendEmail({
      to: "user@example.com",
      from: "noreply@example.com",
      subject: "Resend email",
      template: "<div>Using Resend</div>",
    });

    // Nested calls also use Resend
    await sendEmail({
      to: "user2@example.com",
      from: "noreply@example.com",
      subject: "Another Resend email",
      template: "<div>Also using Resend</div>",
    });
  });

  // Back to default provider
  await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Default again",
    template: "<div>Back to default provider</div>",
  });
}

// ============================================
// Example 4: User Context
// ============================================

async function handleUserAction(userId: string, userEmail: string) {
  await withEmailContext({ userId }, async () => {
    // Send verification email
    await sendEmail({
      to: userEmail,
      from: "noreply@example.com",
      subject: "Verify your email",
      template: "<div>Verify your email</div>",
    });

    // Send welcome email
    await sendEmail({
      to: userEmail,
      from: "noreply@example.com",
      subject: "Welcome!",
      template: "<div>Welcome to our service!</div>",
    });

    // All emails are associated with this userId
  });
}

// ============================================
// Example 5: Priority Chain
// ============================================

async function demonstratePriority() {
  // Priority: Context > Parameter > Environment Variable

  // 1. Environment variable (lowest priority)
  // MAILER_PROVIDER=nodemailer in .env

  await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Uses env provider",
    template: "<div>Uses MAILER_PROVIDER from env</div>",
  });

  // 2. Parameter override (medium priority)
  await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Uses parameter provider",
    template: "<div>Uses provider parameter</div>",
    provider: "resend",
  });

  // 3. Context override (highest priority)
  await withEmailContext({ provider: "sendgrid" }, async () => {
    await sendEmail({
      to: "user@example.com",
      from: "noreply@example.com",
      subject: "Uses context provider",
      template: "<div>Uses provider from context</div>",
      // Even if we specify provider here, context wins
      provider: "resend",
    });
  });
}

// ============================================
// Example 6: Metadata & Logging
// ============================================

async function sendWithMetadata() {
  await withEmailContext(
    {
      requestId: "req-123",
      userId: "user-456",
      metadata: {
        action: "password_reset",
        ip: "192.168.1.1",
        userAgent: "Mozilla/5.0...",
      },
    },
    async () => {
      const context = getEmailContext();
      console.log("Sending email with context:", context);

      await sendEmail({
        to: "user@example.com",
        from: "noreply@example.com",
        subject: "Password Reset",
        template: "<div>Reset your password</div>",
      });

      // Can access context anywhere in the call chain
      const currentContext = getEmailContext();
      console.log("Metadata:", currentContext?.metadata);
    },
  );
}

// ============================================
// Example 7: API Route Integration
// ============================================

async function apiHandlerExample(req: Request) {
  // Extract context from request
  const requestId = req.headers.get("x-request-id");
  const userId = req.headers.get("x-user-id");
  const tenantId = req.headers.get("x-tenant-id");

  // Wrap entire request handler with context
  await withEmailContext(
    { requestId: requestId!, userId: userId!, tenantId: tenantId! },
    async () => {
      // All business logic can send emails without passing context
      await processUserAction();
      await sendNotifications();
      await triggerWorkflows();
    },
  );
}

async function processUserAction() {
  // Can send emails without knowing about request context
  await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Action processed",
    template: "<div>Your action was processed</div>",
  });
}

async function sendNotifications() {
  await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Notification",
    template: "<div>You have a new notification</div>",
  });
}

async function triggerWorkflows() {
  await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Workflow started",
    template: "<div>Your workflow has started</div>",
  });
}

// ============================================
// Example 8: Error Handling with Context
// ============================================

async function sendWithErrorHandling() {
  try {
    await withEmailContext({ requestId: "req-error-test", userId: "user-123" }, async () => {
      await sendEmail({
        to: "invalid-email",
        from: "noreply@example.com",
        subject: "Test",
        template: "<div>Test email</div>",
      });
    });
  } catch (error) {
    const context = getEmailContext();
    console.error(`Failed to send email for request ${context?.requestId}:`, error);

    // Can retry with different provider using context
    if (context) {
      await withEmailContext({ ...context, provider: "fallback-provider" }, async () => {
        await sendEmail({
          to: "user@example.com",
          from: "noreply@example.com",
          subject: "Retry",
          template: "<div>Retrying with fallback provider</div>",
        });
      });
    }
  }
}

// ============================================
// Example 9: A/B Testing
// ============================================

async function abTestEmailProvider(userEmail: string) {
  // Determine which provider to use based on user hash
  const userHash = userEmail.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
  const provider = userHash % 2 === 0 ? "resend" : "sendgrid";

  await withEmailProvider(provider, async () => {
    await sendEmail({
      to: userEmail,
      from: "noreply@example.com",
      subject: "A/B Test Email",
      template: `<div>Email sent via ${provider}</div>`,
    });

    console.log(`User ${userEmail} received email via ${provider}`);
  });
}

// ============================================
// Example 10: Combining Contexts
// ============================================

async function combineContexts() {
  // Outer context with tenant
  await withTenantContext("tenant-123", async () => {
    // Inner context with request tracking
    await withEmailContext({ requestId: "req-456" }, async () => {
      // Both contexts are merged
      const context = getEmailContext();
      console.log("Combined context:", context);
      // { tenantId: "tenant-123", requestId: "req-456" }

      await sendEmail({
        to: "user@example.com",
        from: "noreply@example.com",
        subject: "Combined Context",
        template: "<div>Email with combined context</div>",
      });
    });
  });
}

export {
  handleRequestWithTracking,
  handleTenantRequest,
  sendWithProviderOverride,
  handleUserAction,
  demonstratePriority,
  sendWithMetadata,
  apiHandlerExample,
  sendWithErrorHandling,
  abTestEmailProvider,
  combineContexts,
};
