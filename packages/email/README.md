# @raypx/email

Email templates and sending functionality for Raypx, built with React Email.

## Features

- 📧 **React Email Templates** - Type-safe email templates using React components
- 🎨 **Visual Preview** - Lightweight Vite-powered preview interface
- 🔥 **Hot Reload** - Instant feedback during template development
- 📱 **Responsive Testing** - Desktop and mobile preview modes
- 🚀 **Zero Dependencies on Main App** - Completely isolated preview system
- ⚡ **Fast** - Only ~5MB dependencies (Vite + React), no Next.js overhead

## Available Templates

- `WelcomeEmail` - New user welcome message
- `VerifyEmail` - Email verification
- `ResetPasswordEmail` - Password reset instructions
- `SecurityAlertEmail` - Security notifications
- `OrganizationInviteEmail` - Organization invitations
- `SendMagicLinkEmail` - Magic link authentication
- `SendVerificationOTPEmail` - OTP verification codes
- `ApiKeyCreatedEmail` - API key creation notification

## Development

### Start Preview Server

The email preview is a separate TanStack Start application located at `apps/email/`.

From the project root:

```bash
# Using the root shortcut
pnpm email:dev

# Or directly
turbo dev --filter=email
```

The preview server will start at `http://localhost:3002` and automatically open in your browser.

> **Note:** The preview app is a standalone TanStack Start application. See `apps/email/README.md` for more details.

### Sending Test Emails

Click the "📧 Send Test" button in the preview interface to send a test email:

1. Enter the recipient email address
2. Click "Send Email"
3. Check the send history to see the status

**Email Provider Configuration:**

The preview supports two modes:

**Mock Mode** (default - no configuration needed):
- Emails are logged to the console
- Perfect for template development
- No actual emails sent

**Real Sending Mode** (configure one of):

```bash
# Option 1: Resend (recommended)
RESEND_API_KEY=re_xxx
# or
AUTH_RESEND_KEY=re_xxx

# Option 2: Nodemailer (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_SECURE=false  # true for port 465
```

With configuration, actual emails will be sent to the specified address.

### Features of the Preview Interface

- **Template Selector** - Browse all available email templates in the sidebar
- **Live Rendering** - See real-time updates as you edit templates
- **Device Preview** - Toggle between desktop and mobile views
- **Preview Props** - Each template uses its `.PreviewProps` for realistic rendering
- **Send Test Emails** - Send test emails directly from the preview interface
- **Send History** - Track all test emails with status and timestamp
- **Mock Mode** - Works without email provider configuration (logs to console)

## Usage in Application

### Basic Usage

```typescript
import { sendEmail } from "@raypx/email";
import { WelcomeEmail } from "@raypx/email/emails";

const result = await sendEmail({
  to: "user@example.com",
  from: "noreply@raypx.com",
  subject: "Welcome to Raypx!",
  template: <WelcomeEmail username="John" />,
});

if (result.success) {
  console.log("✅ Email sent successfully!");
  console.log("Email ID:", result.emailId);
} else {
  console.error("❌ Failed to send email:", result.error);
}
```

### With Error Handling

```typescript
import { sendEmail } from "@raypx/email";
import { ResetPasswordEmail } from "@raypx/email/emails";

async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const result = await sendEmail({
    to: email,
    from: "security@raypx.com",
    subject: "Reset Your Password",
    template: <ResetPasswordEmail actionUrl={resetUrl} email={email} />,
  });

  if (!result.success) {
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

### Send to Multiple Recipients

```typescript
import { sendEmail } from "@raypx/email";
import { WelcomeEmail } from "@raypx/email/emails";

const recipients = ["user1@example.com", "user2@example.com", "user3@example.com"];

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

### Response Types

**Success Response:**
```typescript
{
  success: true,
  emailId?: string,      // Resend email ID (if using Resend)
  messageId?: string,    // SMTP message ID (if using Nodemailer)
  provider: "resend" | "nodemailer"
}
```

**Error Response:**
```typescript
{
  success: false,
  error: string,         // Error message
  provider: "resend" | "nodemailer"
}
```

### Provider Selection Priority

1. Explicit `provider` option in `sendEmail()`
2. `MAILER_PROVIDER` environment variable
3. Default: `"resend"`

### Best Practices

**1. Always Handle Errors:**
```typescript
const result = await sendEmail(options);

if (!result.success) {
  // Log to error tracking service
  logger.error("Email failed", { error: result.error, provider: result.provider });
  // Retry or fallback logic
}
```

**2. Use Type-Safe Templates:**
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

**3. Environment-Specific Configuration:**
```typescript
// lib/email.ts
import { sendEmail as baseSendEmail, type SendEmailOptions } from "@raypx/email";

export async function sendEmail(options: Omit<SendEmailOptions, "from">) {
  return baseSendEmail({
    ...options,
    from: process.env.EMAIL_FROM || "noreply@raypx.com",
  });
}
```

### Creating New Templates

1. Create a new file in `src/emails/`:

```tsx
// src/emails/custom-email.tsx
import { Text } from "@react-email/components";
import { EmailLayout } from "../components/layout";
import type { EmailTemplateProps } from "../types";

type CustomEmailProps = Pick<EmailTemplateProps, "username">;

const CustomEmail = ({ username }: CustomEmailProps) => (
  <EmailLayout preview="Your custom preview text">
    <Text>Hello {username}!</Text>
  </EmailLayout>
);

// Preview props for development
CustomEmail.PreviewProps = {
  username: "John Doe",
};

export default CustomEmail;
```

2. Export it in `src/emails/index.ts`:

```typescript
export { default as CustomEmail } from "./custom-email";
```

3. Preview it by running `pnpm email:dev`

## Architecture

### Directory Structure

```
packages/email/
├── src/
│   ├── emails/           # Email templates
│   ├── components/       # Shared email components
│   ├── providers/        # Email sending providers (Resend, Nodemailer)
│   ├── config.ts         # Configuration
│   ├── types.ts          # TypeScript types
│   └── index.ts          # Main exports
└── package.json

# Preview app is located at apps/email/
# See apps/email/README.md for preview application details
```

### Why Not React Email CLI?

React Email's official CLI (`react-email`) includes:
- Full Next.js 16 (~50MB)
- Sharp image processing (~15MB)
- Many other dependencies (~25MB)
- **Total: ~100MB** just for email preview

Our custom Vite solution:
- Vite (~3MB)
- React plugins (~2MB)
- **Total: ~5MB** - **20x smaller!**

### Independence from Main App

The preview system is **completely isolated**:

- ✅ Separate TanStack Start application (`apps/email/`)
- ✅ Separate dev server (port 3002)
- ✅ Zero impact on main app build time
- ✅ No code bundled into production
- ✅ Can be run independently

## Build Preview App

To build the preview application:

```bash
turbo build --filter=email
```

Outputs to `apps/email/.output/` (Nitro build output)

## Configuration

### Environment Variables

```bash
# Choose provider (default: resend)
MAILER_PROVIDER=resend  # or "nodemailer"

# Resend Configuration
RESEND_FROM=noreply@yourdomain.com
AUTH_RESEND_KEY=re_xxxxxxxxxxxxx
# or
RESEND_API_KEY=re_xxxxxxxxxxxxx

# Nodemailer (SMTP) Configuration
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email@gmail.com
MAIL_PASSWORD=your-app-password
# or
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_SECURE=false  # true for port 465
```

### Advanced: Using getMailer() Directly

For advanced use cases, you can use `getMailer()` directly:

```typescript
import { getMailer } from "@raypx/email";
import { WelcomeEmail } from "@raypx/email/emails";

const mailer = await getMailer();
await mailer.sendEmail({
  to: "user@example.com",
  from: "noreply@raypx.com",
  subject: "Welcome!",
  template: <WelcomeEmail username="John" />,
});
```

## Performance

- **Cold start**: ~200ms (TanStack Start)
- **Hot reload**: ~50ms (per template change)
- **Build time**: Not included in main app build
- **Bundle size**: 0 bytes added to production (dev-only app)

## Contributing

When adding new email templates:

1. Add the template file in `src/emails/`
2. Include `PreviewProps` for development
3. Export from `src/emails/index.ts`
4. Test in preview server (`pnpm email:dev`)
5. Update this README if needed

## License

Apache-2.0
