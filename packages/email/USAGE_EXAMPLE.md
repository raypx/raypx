# Email Package Usage Examples

## New Unified API (Recommended)

### Basic Usage

```typescript
import { sendEmail } from "@raypx/email";
import { WelcomeEmail } from "@raypx/email/emails";

// Simple and clean
const result = await sendEmail({
  to: "user@example.com",
  from: "noreply@raypx.com",
  subject: "Welcome to Raypx!",
  template: <WelcomeEmail username="John Doe" />,
});

if (result.success) {
  console.log("✅ Email sent successfully!");
  console.log("Email ID:", result.emailId);
  console.log("Provider:", result.provider);
} else {
  console.error("❌ Failed to send email:", result.error);
}
```

### With Error Handling

```typescript
import { sendEmail, type SendEmailResult } from "@raypx/email";
import { ResetPasswordEmail } from "@raypx/email/emails";

async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const result = await sendEmail({
    to: email,
    from: "security@raypx.com",
    subject: "Reset Your Password",
    template: <ResetPasswordEmail actionUrl={resetUrl} email={email} />,
  });

  if (!result.success) {
    // Log error and retry or notify admin
    console.error("Failed to send password reset:", result.error);
    throw new Error(`Email delivery failed: ${result.error}`);
  }

  return result.emailId;
}
```

### Specify Provider Explicitly

```typescript
import { sendEmail } from "@raypx/email";
import { OrganizationInviteEmail } from "@raypx/email/emails";

// Force use of specific provider
const result = await sendEmail({
  to: "newmember@example.com",
  from: "invites@raypx.com",
  subject: "Join Our Organization",
  template: (
    <OrganizationInviteEmail
      organizationName="Acme Corp"
      inviterName="Jane Smith"
      actionUrl="https://raypx.com/invite/abc123"
    />
  ),
  provider: "resend", // or "nodemailer"
});
```

### Send to Multiple Recipients (Batch)

```typescript
import { sendEmail } from "@raypx/email";
import { WelcomeEmail } from "@raypx/email/emails";

const recipients = ["user1@example.com", "user2@example.com", "user3@example.com"];

// Send to multiple users
const results = await Promise.all(
  recipients.map((email) =>
    sendEmail({
      to: email,
      from: "noreply@raypx.com",
      subject: "Welcome!",
      template: <WelcomeEmail username="User" />,
    }),
  ),
);

const successful = results.filter((r) => r.success).length;
const failed = results.filter((r) => !r.success).length;

console.log(`✅ Sent: ${successful}, ❌ Failed: ${failed}`);
```

### Using Plain HTML String

```typescript
import { sendEmail } from "@raypx/email";

const result = await sendEmail({
  to: "user@example.com",
  from: "noreply@raypx.com",
  subject: "Simple Email",
  template: "<h1>Hello World!</h1><p>This is a plain HTML email.</p>",
});
```

### Type-Safe Email Sending

```typescript
import { sendEmail, type SendEmailOptions, type SendEmailResult } from "@raypx/email";
import { VerifyEmail } from "@raypx/email/emails";

async function sendVerificationEmail(
  options: Pick<SendEmailOptions, "to">,
): Promise<SendEmailResult> {
  return sendEmail({
    ...options,
    from: "verify@raypx.com",
    subject: "Verify Your Email Address",
    template: (
      <VerifyEmail
        actionUrl={`https://raypx.com/verify?email=${options.to}`}
        email={options.to as string}
      />
    ),
  });
}

// Usage
const result = await sendVerificationEmail({
  to: "newuser@example.com",
});
```

## Old API (Still Supported)

### Using getMailer() Directly

```typescript
import { getMailer } from "@raypx/email";
import { WelcomeEmail } from "@raypx/email/emails";

// Manual approach (more verbose)
const mailer = await getMailer();
await mailer.sendEmail({
  to: "user@example.com",
  from: "noreply@raypx.com",
  subject: "Welcome!",
  template: <WelcomeEmail username="John" />,
});
```

## Configuration

### Environment Variables

```bash
# Choose provider (default: resend)
MAILER_PROVIDER=resend  # or "nodemailer"

# Resend Configuration
RESEND_FROM=noreply@yourdomain.com
AUTH_RESEND_KEY=re_xxxxxxxxxxxxx

# Nodemailer (SMTP) Configuration
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email@gmail.com
MAIL_PASSWORD=your-app-password
```

### Provider Selection Priority

1. Explicit `provider` option in `sendEmail()`
2. `MAILER_PROVIDER` environment variable
3. Default: `"resend"`

## Available Email Templates

All templates are available at `@raypx/email/emails`:

- `WelcomeEmail` - New user welcome
- `VerifyEmail` - Email verification
- `ResetPasswordEmail` - Password reset
- `SecurityAlertEmail` - Security notifications
- `OrganizationInviteEmail` - Organization invitations
- `SendMagicLinkEmail` - Magic link authentication
- `SendVerificationOTPEmail` - OTP verification
- `ApiKeyCreatedEmail` - API key creation

### Template Props

```typescript
import type { EmailTemplateProps } from "@raypx/email";

// All templates accept these props (partial)
const props: Partial<EmailTemplateProps> = {
  username: "John Doe",
  email: "user@example.com",
  actionUrl: "https://raypx.com/action",
  otp: "123456",
  organizationName: "Acme Corp",
  inviterName: "Jane Smith",
  apiKeyName: "Production API Key",
  supportEmail: "support@raypx.com",
};
```

## Response Types

### Success Response

```typescript
{
  success: true,
  emailId?: string,      // Resend email ID (if using Resend)
  messageId?: string,    // SMTP message ID (if using Nodemailer)
  provider: "resend" | "nodemailer"
}
```

### Error Response

```typescript
{
  success: false,
  error: string,         // Error message
  provider: "resend" | "nodemailer"
}
```

## Best Practices

### 1. Always Handle Errors

```typescript
const result = await sendEmail(options);

if (!result.success) {
  // Log to error tracking service
  logger.error("Email failed", { error: result.error, provider: result.provider });

  // Retry or fallback logic
  // ...
}
```

### 2. Use Type-Safe Templates

```typescript
import { sendEmail } from "@raypx/email";
import { WelcomeEmail } from "@raypx/email/emails";

// TypeScript will check props
const result = await sendEmail({
  to: "user@example.com",
  from: "noreply@raypx.com",
  subject: "Welcome!",
  template: <WelcomeEmail username="John" />, // Type-safe!
});
```

### 3. Batch Sending with Concurrency Control

```typescript
import pMap from "p-map";
import { sendEmail } from "@raypx/email";

const results = await pMap(
  recipients,
  async (email) =>
    sendEmail({
      to: email,
      from: "noreply@raypx.com",
      subject: "Notification",
      template: <NotificationEmail />,
    }),
  { concurrency: 5 }, // Send 5 emails at a time
);
```

### 4. Environment-Specific Configuration

```typescript
// lib/email.ts
import { sendEmail as baseSendEmail } from "@raypx/email";

export async function sendEmail(options: Omit<SendEmailOptions, "from">) {
  return baseSendEmail({
    ...options,
    from: process.env.EMAIL_FROM || "noreply@raypx.com",
  });
}

// Usage: automatically uses configured "from" address
await sendEmail({
  to: "user@example.com",
  subject: "Hello",
  template: <Email />,
});
```

## Migration Guide

### From Old API to New API

**Before:**

```typescript
import { getMailer } from "@raypx/email";
import { WelcomeEmail } from "@raypx/email/emails";

const mailer = await getMailer();
try {
  await mailer.sendEmail({
    to: "user@example.com",
    from: "noreply@raypx.com",
    subject: "Welcome!",
    template: <WelcomeEmail username="John" />,
  });
  console.log("Email sent");
} catch (error) {
  console.error("Failed:", error.message);
}
```

**After:**

```typescript
import { sendEmail } from "@raypx/email";
import { WelcomeEmail } from "@raypx/email/emails";

const result = await sendEmail({
  to: "user@example.com",
  from: "noreply@raypx.com",
  subject: "Welcome!",
  template: <WelcomeEmail username="John" />,
});

if (result.success) {
  console.log("Email sent");
} else {
  console.error("Failed:", result.error);
}
```

**Benefits:**

- ✅ No need to await `getMailer()`
- ✅ No try-catch required (errors returned as values)
- ✅ Type-safe result discrimination
- ✅ Easier to test and mock
