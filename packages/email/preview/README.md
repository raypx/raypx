# Email Preview App

A standalone TanStack Start application for previewing and testing email templates during development.

## Features

- 📧 **Visual Preview** - See all email templates in real-time
- 📱 **Responsive Testing** - Toggle between desktop and mobile views
- 🚀 **Send Test Emails** - Send test emails to any address
- 📝 **Send History** - Track all test emails with status
- 🎨 **Hot Reload** - Instant updates when templates change
- 🔧 **Mock Mode** - Works without email provider configuration

## Quick Start

```bash
# From project root
pnpm email:dev

# Or directly
turbo dev --filter=email
```

Visit http://localhost:3002

## Architecture

This is a **development-only** application built with:

- **TanStack Start** - Full-stack React framework (same as main app)
- **TanStack Router** - File-based routing with type safety
- **Tailwind CSS v4** - For styling
- **React Email** - For rendering templates

### Why a Separate App?

1. ✅ **Architecture Consistency** - Uses same stack as web app
2. ✅ **API Compatibility** - TanStack Router API routes
3. ✅ **Complete Isolation** - Zero impact on main app
4. ✅ **Dev-Only** - Never deployed to production

### Directory Structure

```
apps/email/
├── src/
│   ├── app/                    # TanStack Router routes
│   │   ├── __root.tsx         # Root layout
│   │   ├── index.tsx          # Preview page
│   │   └── api/
│   │       └── send-test-email.ts  # API route
│   ├── components/
│   │   └── email-preview.tsx  # Main preview UI
│   ├── router.tsx             # Router configuration
│   ├── server.ts              # Server entry point
│   └── app.css                # Tailwind styles
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Email Provider Configuration

### Mock Mode (Default)

No configuration needed - emails are logged to console:

```bash
pnpm email:dev

# Console output:
📧 Mock Email Send:
  To: test@example.com
  From: preview@raypx.dev
  Subject: [Test] WelcomeEmail
  HTML length: 2543 chars
```

### Real Sending Mode

Configure one of the following:

**Option 1: Resend (Recommended)**

```bash
# .env
RESEND_API_KEY=re_xxx
# or
AUTH_RESEND_KEY=re_xxx
```

**Option 2: Nodemailer (SMTP)**

```bash
# .env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_SECURE=false  # true for port 465
```

## Usage

### Preview Templates

1. Start the dev server: `pnpm email:dev`
2. Browse templates in the sidebar
3. Switch between desktop/mobile views
4. See real-time updates when editing templates

### Send Test Emails

1. Click "📧 Send Test" button
2. Enter recipient email address
3. Click "Send Email"
4. Check send history for status

### Development Workflow

```typescript
const workflow = {
  1: "Edit template in packages/email/src/emails/",
  2: "See instant preview in browser",
  3: "Send test email to verify",
  4: "Check real email client rendering",
  5: "Adjust and repeat"
};
```

## Deployment

**This app is NOT deployed to production.**

It's marked as development-only in several ways:

- Listed in `apps/` but not included in production builds
- No deployment configuration
- Only runs locally during development

## Comparison with Previous Setup

| Feature | Old (Vite) | New (TanStack Start) |
|---------|-----------|---------------------|
| Architecture | Custom Vite server | TanStack Start ✅ |
| API Routes | Custom middleware | TanStack Router ✅ |
| Compatibility | Custom solution | Consistent with web app ✅ |
| Port | 3001 | 3002 |
| Hot Reload | ✅ | ✅ |
| Type Safety | Partial | Full ✅ |

## Technical Notes

### Why Port 3002?

- 3000: Main web application
- 3001: Previously used by old Vite preview
- 3002: New TanStack Start email app

### API Routes

API routes use TanStack Router's file-based routing:

```typescript
// apps/email/src/app/api/send-test-email.ts
export const Route = createFileRoute("/api/send-test-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Handle request
      },
    },
  },
});
```

This is **identical** to how the main web app handles API routes.

### Dependencies

The app shares most dependencies with the web app through the catalog system:

- `@tanstack/react-start`
- `@tanstack/react-router`
- `tailwindcss`
- `vite`

Only email-specific deps are unique:
- `@raypx/email` (workspace package)
- `@react-email/render`

## Contributing

When adding new email templates:

1. Create template in `packages/email/src/emails/`
2. Export from `packages/email/src/emails/index.ts`
3. Add `PreviewProps` for preview data
4. Start email app to test: `pnpm email:dev`

## License

Apache-2.0
