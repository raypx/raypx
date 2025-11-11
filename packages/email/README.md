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

From the project root:

```bash
# Using the root shortcut
pnpm email:dev

# Or directly
pnpm --filter @raypx/email run dev
```

The preview server will start at `http://localhost:3001` and automatically open in your browser.

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

### Sending an Email

```typescript
import { sendEmail } from "@raypx/email";
import { WelcomeEmail } from "@raypx/email/emails";

await sendEmail({
  to: "user@example.com",
  subject: "Welcome to Raypx!",
  react: <WelcomeEmail username="John" />,
});
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
├── preview/              # Preview app (isolated from main app)
│   ├── app.tsx          # Preview interface
│   ├── main.tsx         # Preview entry point
│   ├── index.html       # Preview HTML
│   └── styles.css       # Preview styles
├── vite.config.ts       # Vite configuration for preview
└── package.json
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

- ✅ Separate Vite server (port 3001)
- ✅ Separate build output (`dist-preview`)
- ✅ Zero impact on main app build time
- ✅ No code bundled into production
- ✅ Can be run independently

## Build Static Preview

To export static HTML previews:

```bash
pnpm email:build
```

Outputs to `packages/email/dist-preview/`

## Email Providers

### Resend (Recommended)

```typescript
import { createEmailProvider } from "@raypx/email";

const provider = createEmailProvider({
  type: "resend",
  apiKey: process.env.RESEND_API_KEY,
});
```

### Nodemailer

```typescript
const provider = createEmailProvider({
  type: "nodemailer",
  config: {
    host: "smtp.example.com",
    port: 587,
    auth: {
      user: "user",
      pass: "pass",
    },
  },
});
```

## Environment Variables

```bash
# .env
RESEND_API_KEY=re_xxx
# Or for Nodemailer
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user
SMTP_PASS=pass
```

## Performance

- **Cold start**: ~100ms (Vite)
- **Hot reload**: ~10ms (per template change)
- **Build time**: Not included in main app build
- **Bundle size**: 0 bytes added to production (dev only)

## Contributing

When adding new email templates:

1. Add the template file in `src/emails/`
2. Include `PreviewProps` for development
3. Export from `src/emails/index.ts`
4. Test in preview server (`pnpm email:dev`)
5. Update this README if needed

## License

Apache-2.0
