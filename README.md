# Raypx

> Modern full-stack application with authentication, billing, and more.

## Features

- 🔐 **Authentication** - Email/Password, GitHub, Google OAuth via [better-auth](https://www.better-auth.com/)
- 💳 **Billing** - Stripe integration for subscription management
- 📧 **Email** - Transactional emails with Resend
- 📊 **Analytics** - PostHog and Google Analytics support
- 🐛 **Observability** - Sentry error tracking
- 🌍 **Internationalization** - Multi-language support via i18next
- 📝 **Documentation** - Integrated docs site with Fumadocs
- 🎨 **UI Components** - Shadcn UI component library
- 🔍 **Type Safety** - End-to-end type safety with oRPC
- ⚡ **Fast Build** - Turbo-powered monorepo with Bun

## Tech Stack

### Core
- **Package Manager**: [Bun](https://bun.sh/)
- **Framework**: [TanStack Start](https://tanstack.com/start)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Monorepo**: [Turborepo](https://turbo.build/)

### Backend
- **Database**: [PostgreSQL](https://www.postgresql.org/) with [Drizzle ORM](https://orm.drizzle.team/)
- **Auth**: [better-auth](https://www.better-auth.com/)
- **API**: [oRPC](https://orpc.dev/)
- **Validation**: [Zod](https://zod.dev/)

### Frontend
- **UI**: [React 19](https://react.dev/) + [Tailwind CSS](https://tailwindcss.com/) (with minification)
- **Components**: [Shadcn UI](https://ui.shadcn.com/)
- **Routing**: [TanStack Router](https://tanstack.com/router)
- **State**: [TanStack Query](https://tanstack.com/query)
- **Performance**: CSS preloading and optimized asset delivery

### Infrastructure
- **Email**: [Resend](https://resend.com/)
- **Payments**: [Stripe](https://stripe.com/)
- **Analytics**: [PostHog](https://posthog.com/)
- **Error Tracking**: [Sentry](https://sentry.io/)
- **Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/)

## Project Structure

```
raypx/
├── apps/
│   ├── docs/          # Documentation site
│   └── web/           # Main web application
├── packages/
│   ├── auth/          # Authentication configuration
│   ├── billing/       # Stripe billing integration
│   ├── config/        # Shared configuration
│   ├── database/      # Database schema and client
│   ├── email/         # Email service with Resend
│   ├── env/           # Environment variables validation
│   ├── i18n/          # Internationalization
│   ├── logger/        # Logging utilities
│   ├── observability/ # Analytics and error tracking
│   ├── rpc/           # Type-safe RPC API
│   └── ui/            # Shared UI components
└── scripts/           # Utility scripts
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [Bun](https://bun.sh/) >= 1.2
- [PostgreSQL](https://www.postgresql.org/) >= 14

### Installation

```bash
# Clone the repository
git clone https://github.com/raypx/raypx.git
cd raypx

# Install dependencies
bun install

# Copy environment variables
cp .env.example .env

# Update .env with your configuration
```

### Database Setup

```bash
# Generate database client
bun run db:generate

# Push migrations
bun run db:push

# (Optional) Seed database
bun run db:seed
```

### Development

```bash
# Start development server
bun run dev

# Start specific app
bun run dev:web      # Web application (http://localhost:3000)
bun run dev:docs     # Documentation (http://localhost:3004)
```

### Build

```bash
# Build all apps
bun run build

# Build specific app
bun run build:web
bun run build:docs
```

## Available Commands

### Development

```bash
bun run dev              # Start all apps
bun run dev:web          # Start web app
bun run dev:docs         # Start docs site
```

### Build

```bash
bun run build            # Build all apps
bun run build:web        # Build web app
bun run build:docs       # Build docs site
```

### Code Quality

```bash
bun run format           # Format code with Biome
bun run lint             # Lint code with Biome
bun run typecheck        # Run TypeScript type checking
bun run test             # Run tests
bun run knip             # Check for unused files
```

### Database

```bash
bun run db               # Run Drizzle Kit CLI
bun run db:generate      # Generate database client
bun run db:push          # Push migrations
bun run db:migrate       # Run migrations
bun run db:studio        # Open Drizzle Studio
```

### Cleaning

```bash
bun run clean            # Clean build artifacts
bun run clean:all        # Clean build artifacts + turbo cache
bun run reinstall        # Reinstall all dependencies
```

## Docker

```bash
# Build web app
docker build -f apps/web/Dockerfile -t raypx/web:latest .

# Run container
docker run -p 3000:3000 --env-file .env raypx/web:latest

# Health check
curl http://localhost:3000/api/health
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[Apache-2.0](LICENSE)

Copyright 2025 https://raypx.com

## Support

- 📖 [Documentation](https://raypx.com)
- 💬 [Discord](https://discord.gg/raypx)
- 🐛 [Issues](https://github.com/raypx/raypx/issues)
- 📧 [Email](mailto:support@raypx.com)
