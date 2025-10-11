# Raypx

[![Version](https://img.shields.io/github/package-json/v/raypx/raypx?style=flat-square)](https://github.com/raypx/raypx)
[![License](https://img.shields.io/github/license/raypx/raypx?style=flat-square)](https://opensource.org/licenses/Apache-2.0)
[![pnpm](https://img.shields.io/badge/pnpm-10.17.1-orange?style=flat-square&logo=pnpm)](https://pnpm.io/)
[![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-red?style=flat-square&logo=turborepo)](https://turbo.build/)
[![Biome](https://img.shields.io/badge/Biome-linter%20%26%20formatter-yellow?style=flat-square&logo=biome)](https://biomejs.dev/)

> A modern, high-performance web application platform built with TanStack Start and React 19, designed specifically for building scalable AI-powered applications with enterprise-grade security and uncompromising type safety.

## 🚧 Project Status

> **✅ Core Architecture Complete - Ready for Feature Development**

The project has successfully completed its migration from Next.js to TanStack Start, establishing a solid foundation for scalable AI-powered applications. All core systems are now fully functional and type-safe.

**Current Phase**: Feature Development & Enhancement

## ✨ Features

- **🤖 AI-First Architecture** - Built-in AI integrations and optimizations
- **⚡ Lightning Fast** - TanStack Start with Vite and React 19
- **🔐 Enterprise Security** - Advanced authentication and authorization
- **🎨 Modern UI/UX** - Beautiful components with Radix UI + Tailwind CSS
- **📊 Real-time Analytics** - Comprehensive monitoring and insights
- **🔄 Type-Safe APIs** - End-to-end TypeScript with tRPC
- **🗄️ Database Agnostic** - Flexible ORM with Drizzle
- **🚀 Deploy Anywhere** - Optimized for cloud platforms

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 20.0.0 (LTS recommended)
- **pnpm** >= 10.17.0 (required for workspace management)
- **Git** for version control

### Installation

```bash
# Clone the repository
git clone https://github.com/raypx/raypx.git
cd raypx

# Install dependencies with pnpm
pnpm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your configuration

# Run database migrations (if applicable)
pnpm db:migrate

# Start development server
pnpm dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

> **Note**: Some features may not be fully functional during the development phase. See [Known Issues](#-known-issues) for current limitations.

## 📚 Documentation

### User Documentation
Comprehensive user guides and API documentation will be available at the documentation website once deployed.

### Technical Documentation
Technical documentation is managed within the development workflow and will be integrated into the main documentation site.

## ✅ Recent Achievements

### Migration Complete
- **✅ Next.js to TanStack Start** - Successfully migrated entire codebase
- **✅ Type Safety** - 100% TypeScript coverage with zero errors
- **✅ Performance** - Optimized build system and bundle size
- **✅ Dependencies** - Cleaned up all legacy dependencies

### Core Systems Ready
- **✅ Authentication** - Enterprise-grade auth with Better Auth
- **✅ Internationalization** - React-i18next integration complete
- **✅ UI Components** - Modern component library with Radix UI
- **✅ Database Layer** - Drizzle ORM with PostgreSQL support
- **✅ API Layer** - Type-safe tRPC implementation

## 🚀 Current Work in Progress

### Phase 1: Core Migration ✅ Complete
- [x] Next.js to TanStack Start migration
- [x] Authentication system integration
- [x] Internationalization with react-i18next
- [x] UI component library setup
- [x] Type safety improvements

### Phase 2: Feature Development (In Progress)
- [ ] AI integration enhancements
- [ ] Advanced analytics dashboard
- [ ] Real-time collaboration features
- [ ] Performance monitoring tools

### Phase 3: Production Optimization (Planned)
- [ ] Advanced caching strategies
- [ ] CDN integration
- [ ] Security hardening
- [ ] Monitoring and alerting

## 🗺️ Roadmap

### Q1 2025 - Feature Development
- **AI Integration** - Advanced AI-powered features and workflows
- **Analytics Dashboard** - Comprehensive monitoring and insights
- **Real-time Features** - Live collaboration and updates
- **Mobile Optimization** - Responsive design and mobile-first approach

### Q2 2025 - Production Readiness
- **Security Hardening** - Advanced security features and audits
- **Performance Optimization** - CDN integration and caching strategies
- **Monitoring & Alerting** - Production-grade observability
- **Documentation** - Complete user and developer documentation

### Q3 2025 - Ecosystem Expansion
- **Plugin Architecture** - Extensible plugin system
- **Third-party Integrations** - Major platform integrations
- **Developer Tools** - CLI tools and development utilities
- **Community Features** - Open source community tools

These improvements are being tracked through GitHub Issues and project milestones.

## 🛠️ Tech Stack

### Core Framework
- **[TanStack Start](https://tanstack.com/start)** - Full-stack React framework with best-in-class type safety
- **[TanStack Router](https://tanstack.com/router)** - Type-safe routing with automatic code generation
- **[React 19](https://react.dev/)** - Latest React with concurrent features
- **[TypeScript 5.9.3](https://www.typescriptlang.org/)** - Strict type-safe development
- **[Vite](https://vitejs.dev/)** - Lightning-fast build tool

### Development Tools
- **[pnpm 10.17.0](https://pnpm.io/)** - Fast, disk space efficient package manager
- **[Turborepo](https://turbo.build/)** - High-performance build system for monorepos
- **[Biome](https://biomejs.dev/)** - Fast linter and formatter
- **[Husky](https://typicode.github.io/husky/)** + **[Commitlint](https://commitlint.js.org/)** - Git hooks and commit standards

### UI & Styling
- **[Radix UI](https://www.radix-ui.com/)** - Unstyled, accessible UI primitives
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[shadcn/ui](https://ui.shadcn.com/)** - Beautiful, customizable component library
- **[Framer Motion](https://www.framer.com/motion/)** - Production-ready motion library

### Backend & Database
- **[Drizzle ORM](https://orm.drizzle.team/)** - TypeScript ORM with SQL-like syntax
- **[PostgreSQL](https://www.postgresql.org/)** - Advanced open source database
- **[Redis](https://redis.io/)** - In-memory data structure store
- **[Nodemailer](https://nodemailer.com/)** - Email service integration

### Testing & Quality
- **[Vitest](https://vitest.dev/)** - Fast unit testing framework
- **[Playwright](https://playwright.dev/)** - End-to-end testing
- **[TypeScript ESLint](https://typescript-eslint.io/)** - TypeScript linting rules

## 📁 Project Structure

```
raypx/
├── apps/                          # Applications
│   └── app/                      # Main TanStack Start application
│       ├── src/app/              # File-based routes
│       ├── src/components/       # React components
│       ├── src/integrations/     # tRPC and TanStack Query setup
│       └── public/               # Static assets
├── packages/                      # Shared packages
│   ├── ui/                       # UI component library
│   │   ├── components/           # Reusable UI components
│   │   └── lib/                  # UI utilities and themes
│   ├── i18n/                     # Internationalization system ✅
│   │   ├── src/                  # Core i18n functionality
│   │   └── locales/              # Translation files
│   ├── auth/                     # Authentication system ✅
│   ├── db/                       # Database layer and migrations ✅
│   ├── email/                    # Email templates and service ✅
│   ├── analytics/                # Analytics and tracking ✅
│   ├── config/                   # Shared configurations ✅
│   ├── shared/                   # Common utilities and types ✅
│   └── trpc/                     # Type-safe API layer ✅
├── tooling/                       # Development tools
│   ├── biome/                    # Biome configuration
│   ├── tsconfig/                 # TypeScript configurations
│   └── scripts/                  # Build and deployment scripts
└── .github/                       # GitHub workflows and templates
    └── workflows/                # CI/CD pipelines
```

> **📝 Note**:
> - All core packages are now fully functional and type-safe
> - The project has successfully migrated from Next.js to TanStack Start
> - Ready for feature development and production deployment

## 🚀 Available Scripts

```bash
# Development
pnpm dev              # Start development server
pnpm build            # Build for production
pnpm start            # Start production server
pnpm preview          # Preview production build

# Code Quality
pnpm check            # Run Biome linting
pnpm format           # Format code with Biome
pnpm typecheck        # Run TypeScript type checking

# Testing
pnpm test             # Run unit tests
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage
pnpm test:e2e         # Run end-to-end tests

# Database
pnpm db:migrate       # Run database migrations
pnpm db:studio        # Open Drizzle Studio
pnpm db:seed          # Seed database with test data

# Utilities
pnpm clean            # Clean build artifacts
pnpm update:deps      # Update dependencies interactively
```

## 🔧 Development Notes

### Current Development Status

The project has completed its core migration and is now ready for feature development. All systems are fully functional and type-safe.

### ✅ System Status

- **Core Architecture**: ✅ Complete and stable
- **Type Safety**: ✅ 100% TypeScript coverage
- **Authentication**: ✅ Enterprise-grade auth system
- **Internationalization**: ✅ React-i18next integration complete
- **UI Components**: ✅ Modern component library ready

### 🛠️ Development Best Practices

- **Run Tests**: Always run `pnpm test` before committing changes
- **Check Types**: Use `pnpm typecheck` to verify TypeScript compliance
- **Code Quality**: Run `pnpm check` and `pnpm format` before submitting PRs
- **Feature Development**: Focus on building new features on the solid foundation

### 🐛 Reporting Issues

When reporting issues, please include:

1. **Environment Details**: Node.js version, pnpm version, operating system
2. **Steps to Reproduce**: Clear reproduction steps
3. **Expected vs Actual**: What you expected vs what happened
4. **Feature Context**: Which feature or component is affected

### 💡 Development Tips

- Use `pnpm dev` to start the development server
- TanStack DevTools are automatically available in development mode
- Routes are auto-generated in `.tanstack/routeTree.gen.ts`
- All packages are fully type-safe and ready for development
- Check the roadmap for upcoming features and priorities

## 🤝 Contributing

We welcome contributions from the community! The project has a solid foundation and is ready for feature development.

### How to Contribute

1. **Check Roadmap**: Review our [Roadmap](#-roadmap) to see upcoming features
2. **Review GitHub Issues**: Check open issues and feature requests
3. **Join Discussions**: Participate in GitHub Discussions for feature ideas
4. **Start Small**: Begin with documentation improvements or small features

### Development Guidelines

- **Feature Development**: Focus on building new features on the stable foundation
- **Code Quality**: Maintain high standards with TypeScript and testing
- **Documentation**: Update relevant docs when adding new features
- **Testing**: Ensure all tests pass and add coverage for new features

### Priority Areas for Contributions

- **Feature Development**: Build new AI-powered features and workflows
- **UI/UX Improvements**: Enhance user interface and experience
- **Documentation**: Improve setup guides and API documentation
- **Testing**: Add comprehensive test coverage for new features

For detailed contributing information, please check:

- Code of Conduct
- Development setup
- Submitting pull requests
- Reporting issues
- Coding standards

## 📦 Release & CI

### Changesets-based release

- Create changesets locally: `pnpm changeset`
- Merge到 `main` 后，`.github/workflows/release.yml` 将：
  - 执行 `pnpm changeset version` 生成版本与变更说明
  - 执行 `pnpm changeset publish` 发布到 npm 并自动打包版本 tag

Required Secrets:
- `NPM_TOKEN`: npm publish 权限 Token
- `GITHUB_TOKEN`: GitHub Actions 默认提供

## 📄 License

This project is licensed under the [Apache License 2.0](https://opensource.org/licenses/Apache-2.0).

## 🙏 Acknowledgments

Special thanks to all the amazing open source projects that make Raypx possible:
- [TanStack](https://tanstack.com/) for the incredible ecosystem (Router, Query, Start)
- [Radix UI](https://www.radix-ui.com/) for accessible UI primitives
- [Tailwind Labs](https://tailwindlabs.com/) for Tailwind CSS
- [Drizzle Team](https://orm.drizzle.team/) for the excellent ORM

---

<div align="center">

**[Website](https://raypx.com)** • **[Documentation](https://docs.raypx.com)** • **[GitHub](https://github.com/raypx/raypx)** • **[Issues](https://github.com/raypx/raypx/issues)**

Made with ❤️ by the Raypx team

</div>