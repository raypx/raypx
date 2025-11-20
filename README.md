# Raypx

[![License](https://img.shields.io/github/license/raypx/raypx?style=flat-square)](https://opensource.org/licenses/Apache-2.0)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/raypx/raypx)

> A modern, high-performance full-stack web application platform built with TanStack Start and React 19, designed for building scalable AI-powered applications with enterprise-grade security and uncompromising type safety.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Setup environment
cp .env.example .env

# Run database migrations
pnpm --filter @raypx/db run db:migrate

# Start development server
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000)

## ✨ Features

- **⚡ Lightning Fast** - TanStack Start with Vite 7 and React 19
- **🔐 Enterprise Security** - Better Auth with OAuth, 2FA, and session management
- **🎨 Modern UI/UX** - shadcn/ui with Radix UI and Tailwind CSS v4
- **📊 Type-Safe APIs** - End-to-end type safety with tRPC
- **🗄️ Powerful ORM** - Drizzle ORM with PostgreSQL
- **🤖 AI-Ready** - Built-in support for OpenAI and DeepSeek
- **🚀 Deploy Anywhere** - Netlify, Vercel, Cloudflare, or self-hosted

## 🛠️ Tech Stack

### Core
- **[TanStack Start](https://tanstack.com/start)** 1.135.2 - Full-stack React framework
- **[React](https://react.dev/)** 19.2.0 - UI library with concurrent features
- **[TypeScript](https://www.typescriptlang.org/)** 5.9.3 - Type safety
- **[Vite](https://vitejs.dev/)** 7.2.2 - Lightning-fast build tool

### Backend
- **[Better Auth](https://better-auth.com)** 1.3.34 - Modern authentication
- **[Drizzle ORM](https://orm.drizzle.team)** 0.44.7 - Type-safe database toolkit
- **[tRPC](https://trpc.io/)** 11.7.1 - Type-safe APIs
- **[PostgreSQL](https://www.postgresql.org/)** - Primary database

### UI & Styling
- **[Tailwind CSS](https://tailwindcss.com/)** v4.1.17 - Utility-first CSS
- **[Radix UI](https://www.radix-ui.com/)** - Accessible primitives
- **[shadcn/ui](https://ui.shadcn.com/)** - Component library

### Development
- **[pnpm](https://pnpm.io/)** 10.17.0+ - Fast package manager
- **[Turborepo](https://turbo.build/)** 2.6.1 - Monorepo build system
- **[Biome](https://biomejs.dev/)** 2.3.5 - Fast linter & formatter
- **[Vitest](https://vitest.dev/)** 4.0.8 - Testing framework

## 📁 Project Structure

```
raypx/
├── apps/
│   ├── web/          # Main TanStack Start application
│   └── docs/         # Fumadocs documentation site
│
├── packages/         # 13 shared packages
│   ├── analytics/    # Analytics integration
│   ├── auth/         # Authentication system
│   ├── bundler/      # Build utilities
│   ├── cli/          # CLI tools
│   ├── db/           # Database layer (Drizzle ORM)
│   ├── email/        # Email templates with preview server
│   ├── env/          # Environment validation
│   ├── i18n/         # Internationalization (WIP)
│   ├── redis/        # Redis client
│   ├── shared/       # Shared utilities
│   ├── trpc/         # Type-safe API layer
│   ├── tsconfig/     # TypeScript configurations
│   └── ui/           # UI component library (60+ components)
│
└── tooling/          # Development tools
```

## 🚀 Available Scripts

```bash
# Development
pnpm dev              # Start development server
pnpm build            # Build for production
pnpm preview          # Preview production build
pnpm email-preview    # Email template preview

# Code Quality
pnpm check            # Lint with Biome
pnpm format           # Format code
pnpm typecheck        # TypeScript type checking

# Testing
pnpm test             # Run tests
pnpm coverage         # Test coverage

# Database
pnpm --filter @raypx/db run db:studio    # Database GUI
pnpm --filter @raypx/db run db:migrate   # Run migrations

# Utilities
pnpm clean            # Clean build artifacts
pnpm shadcn           # Add shadcn/ui component
```

## 📖 Documentation

- **[Getting Started](CLAUDE.md)** - Development setup and guidelines
- **[Architecture](CLAUDE.md#project-structure)** - Project structure and design
- **[Deployment](CLAUDE.md#deployment)** - Deployment guides

## 🎯 Project Status

**✅ Production-Ready Foundation**

The project has completed its migration from Next.js to TanStack Start and established a solid, type-safe foundation for building scalable applications.

### Completed
- ✅ TanStack Start migration with React 19
- ✅ Enterprise-grade authentication system
- ✅ Type-safe API layer with tRPC
- ✅ Modern UI component library
- ✅ Database layer with Drizzle ORM
- ✅ Email template system
- ✅ Analytics integration

### In Progress
- 🔄 AI integration enhancements
- 🔄 Advanced analytics dashboard
- 🔄 Real-time collaboration features

## 🗺️ Roadmap

### Q1 2025 - Feature Development
- AI-powered features and workflows
- Comprehensive analytics dashboard
- Real-time collaboration features
- Mobile optimization

### Q2 2025 - Production Readiness
- Security hardening and audits
- Performance optimization with CDN
- Production-grade observability
- Complete documentation

### Q3 2025 - Ecosystem Expansion
- Plugin architecture
- Third-party integrations
- CLI tools and utilities
- Community features

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Check the [Roadmap](#-roadmap)** for upcoming features
2. **Review [GitHub Issues](https://github.com/raypx/raypx/issues)** for tasks
3. **Read [CLAUDE.md](CLAUDE.md)** for development guidelines
4. **Submit Pull Requests** with clear descriptions

### Development Guidelines

- Run `pnpm typecheck` before committing
- Use `pnpm check` and `pnpm format` for code quality
- Write tests for new features
- Follow [Conventional Commits](https://www.conventionalcommits.org/)
- Keep commits professional (no AI attribution)

## 📦 Release & CI

This project uses **[Changesets](https://github.com/changesets/changesets)** for version management:

```bash
# Create a changeset
pnpm changeset

# On merge to main, CI will:
# 1. Run pnpm changeset version
# 2. Run pnpm changeset publish
# 3. Create version tags
```

**Required Secrets:**
- `NPM_TOKEN` - npm publish token
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

## 🧪 Development Notes

### Prerequisites
- Node.js >= 20.0.0
- pnpm >= 10.17.0
- PostgreSQL database
- Redis (optional)

### Environment Variables
Copy `.env.example` to `.env` and configure:
- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` - Auth secret (min 32 chars)
- `BETTER_AUTH_URL` - Application URL
- Plus 130+ optional feature flags and integrations

### Known Commands
```bash
# Type checking
pnpm typecheck

# Build validation (important before commits)
pnpm build

# Database GUI
pnpm --filter @raypx/db run db:studio

# Add UI component
pnpm shadcn add button
```

## 🐛 Troubleshooting

**Build Issues:**
```bash
pnpm clean && rm -rf node_modules && pnpm install
```

**Port Already in Use:**
```bash
lsof -ti:3000 | xargs kill -9
```

**TypeScript Errors:**
- Restart TS server in your editor
- Run `pnpm typecheck` to verify

**More Help:**
- Check [CLAUDE.md](CLAUDE.md#troubleshooting) for detailed troubleshooting
- Search [GitHub Issues](https://github.com/raypx/raypx/issues)

## 📄 License

This project is licensed under the [Apache License 2.0](LICENSE).

## 🙏 Acknowledgments

Built with amazing open source projects:
- [TanStack](https://tanstack.com/) for the incredible React ecosystem
- [Radix UI](https://www.radix-ui.com/) for accessible primitives
- [Tailwind Labs](https://tailwindlabs.com/) for Tailwind CSS
- [Drizzle Team](https://orm.drizzle.team/) for the excellent ORM

---

<div align="center">

**[Website](https://raypx.com)** • **[Documentation](https://docs.raypx.com)** • **[GitHub](https://github.com/raypx/raypx)** • **[Issues](https://github.com/raypx/raypx/issues)**

Made with ❤️ by the Raypx team

</div>
