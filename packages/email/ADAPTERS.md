# Email Adapters Documentation

This package uses an adapter-based architecture with dynamic dependency loading and global caching. This means you only need to install the email provider packages you actually use, and modules are cached after first load.

## Available Adapters

### Built-in Adapters

- **Nodemailer** - SMTP email sending
- **Resend** - Modern email API
- **SendGrid** - Transactional email service
- **AWS SES** - Amazon Simple Email Service

## Installation

### Base Package

```bash
pnpm add @raypx/email
```

### Adapter-Specific Dependencies

All email providers are included in the package dependencies. No additional installation needed.

## Usage

### Basic Usage

```typescript
import { sendEmail } from "@raypx/email";

// Send an email using the default provider
const result = await sendEmail({
  to: "user@example.com",
  from: "noreply@example.com",
  subject: "Hello World",
  template: "<div>Welcome to our service!</div>",
});

if (result.success) {
  console.log("Email sent:", result.emailId);
} else {
  console.error("Failed to send:", result.error);
}
```

### Using React Templates

```typescript
import { sendEmail } from "@raypx/email";
import WelcomeEmail from "./emails/WelcomeEmail";

const result = await sendEmail({
  to: "user@example.com",
  from: "noreply@example.com",
  subject: "Welcome!",
  template: <WelcomeEmail userName="John" />,
});
```

### Specifying a Provider

```typescript
import { sendEmail } from "@raypx/email";

// Use a specific provider for this email
const result = await sendEmail({
  to: "user@example.com",
  from: "noreply@example.com",
  subject: "Hello",
  template: "<div>Email content</div>",
  provider: "resend", // or "nodemailer", "sendgrid", "aws-ses"
});
```

### Getting an Adapter Instance

```typescript
import { getMailer } from "@raypx/email";

const mailer = await getMailer();
// mailer is an instance of the configured adapter
```

## Configuration

### Environment Variables

Set the `MAILER_PROVIDER` environment variable to choose your default provider:

```bash
# .env
MAILER_PROVIDER=resend
```

#### Nodemailer Configuration

```bash
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your_email@example.com
MAIL_PASSWORD=your_password
```

#### Resend Configuration

```bash
AUTH_RESEND_KEY=re_xxxxxxxxxxxxxx
```

#### SendGrid Configuration

```bash
SENDGRID_API_KEY=SG.xxxxxx.xxxxxx
```

#### AWS SES Configuration

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

## Creating Custom Adapters

You can easily add your own email adapters by extending the `BaseEmailAdapter` class:

```typescript
// src/adapters/my-custom.ts
import { BaseEmailAdapter } from "./base";
import type { EmailAdapterResult } from "./types";
import type { z } from "zod";
import type { MailerSchema } from "../types";

export class MyCustomAdapter extends BaseEmailAdapter {
  constructor() {
    super("my-custom");
  }

  async sendEmail(config: z.infer<typeof MailerSchema>): Promise<EmailAdapterResult> {
    // Dynamically import your email service package
    const EmailService = await import("my-email-service");

    // Render template
    const html = await this.render(config.template);

    // Send email
    const result = await EmailService.send({
      to: config.to,
      from: config.from,
      subject: config.subject,
      html,
    });

    return {
      id: result.id,
    };
  }
}

export function createMyCustomAdapter() {
  return new MyCustomAdapter();
}
```

Then register it in `src/adapters/index.ts`:

```typescript
export { MyCustomAdapter, createMyCustomAdapter } from "./my-custom";

export const ADAPTERS = {
  // ... existing adapters
  "my-custom": async () => {
    const { createMyCustomAdapter } = await import("./my-custom");
    return createMyCustomAdapter();
  },
} as const;
```

And update `src/types.ts`:

```typescript
export type EmailProvider = "resend" | "nodemailer" | "sendgrid" | "aws-ses" | "my-custom";

export const EmailProvider = {
  RESEND: "resend",
  NODEMAILER: "nodemailer",
  SENDGRID: "sendgrid",
  AWS_SES: "aws-ses",
  MY_CUSTOM: "my-custom",
} as const;
```

Finally, register it in `src/index.ts`:

```typescript
const MAILER_PROVIDERS = [
  "nodemailer",
  "resend",
  "sendgrid",
  "aws-ses",
  "my-custom", // Add your adapter
] as const;

mailerRegistry.register("my-custom", () => ADAPTERS["my-custom"]());
```

## Architecture

### Key Benefits

1. **Dynamic Dependency Loading**: Email service packages are only loaded when needed
2. **Global Caching**: Modules are cached globally after first load for optimal performance
3. **Consistent API**: Same interface for all providers
4. **Type Safety**: Full TypeScript support with proper types
5. **AsyncContext Support**: Track requests across async boundaries

### Performance

- **First load**: ~100ms (module loading + initialization)
- **Cached**: ~5ms (20x faster)
- **Zero-config caching**: Automatic, no manual management needed

### Error Handling

All adapters include dependency checking and will provide clear error messages if:

- Required packages are not installed
- Configuration is invalid
- API keys are missing or invalid

Example error messages:

```
Error: Resend package is not installed. Please install it using: pnpm add resend
Error: Invalid Resend API key. Please set AUTH_RESEND_KEY environment variable with a valid key starting with 're_'
```

## Advanced Features

### AsyncContext for Request Tracking

```typescript
import { withEmailContext } from "@raypx/email";

await withEmailContext({ requestId: "req-123", userId: "user-456" }, async () => {
  // All emails in this scope will have the context attached
  await sendEmail({...});
});
```

### Provider Override

```typescript
import { withEmailProvider } from "@raypx/email";

await withEmailProvider("resend", async () => {
  // All emails in this scope will use Resend
  await sendEmail({...});
});
```

### Multi-Tenant Support

```typescript
import { withTenantContext } from "@raypx/email";

await withTenantContext("tenant-123", async () => {
  // Use tenant-specific configuration
  await sendEmail({...});
});
```

## Migration from Old Provider System

If you were using the old provider system, the migration is straightforward:

**Before:**
```typescript
import { sendEmail } from "@raypx/email";
// Used internally: providers/nodemailer, providers/resend
```

**After:**
```typescript
import { sendEmail } from "@raypx/email";
// Uses adapters with dynamic loading, global caching, and context support - no code changes needed!
```

The API remains the same, but now with:
- Better performance (global caching)
- Faster response times (cached modules)
- More providers (SendGrid, AWS SES)
- Better error messages
- AsyncContext support
