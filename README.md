# Raypx

[![Version](https://img.shields.io/github/package-json/v/raypx/raypx?style=flat-square)](https://github.com/raypx/raypx)
[![License](https://img.shields.io/github/license/raypx/raypx?style=flat-square)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)](https://reactjs.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-red?style=flat-square&logo=turborepo)](https://turbo.build/)
[![Biome](https://img.shields.io/badge/Biome-linter%20%26%20formatter-yellow?style=flat-square&logo=biome)](https://biomejs.dev/)
![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/raypx/raypx?utm_source=oss&utm_medium=github&utm_campaign=raypx%2Fraypx&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

> A modern web application platform built with Next.js and TypeScript for building AI-powered applications.

## 🚀 Getting Started

Visit [raypx.com](https://dub.sh/raypx) to get started with the platform.

## 📚 Documentation

Comprehensive documentation is available at [docs.raypx.com](https://docs.raypx.com).

## 🛠️ Tech Stack

- **Framework**: Next.js 15.4.5 with React 19
- **Language**: TypeScript 5.8.3
- **Package Manager**: pnpm 10.14.0
- **Monorepo**: Turborepo
- **UI Components**: Radix UI + Tailwind CSS (shadcn/ui)
- **Database**: Drizzle ORM
- **Authentication**: Custom auth system
- **Email**: Nodemailer
- **Cache**: Redis
- **Code Quality**: Biome (linting & formatting)
- **Git Hooks**: Husky + Commitlint

## 📁 Project Structure

```
raypx/
├── apps/
│   ├── web/          # Main Next.js application
│   └── docs/         # Documentation site (Fumadocs)
├── packages/         # Shared packages
│   ├── ui/           # UI component library
│   ├── auth/         # Authentication system
│   ├── db/           # Database layer (Drizzle)
│   ├── email/        # Email service
│   └── ...           # Other utilities
└── tooling/          # Development tools & configs
```

## 🤝 Contributing

We welcome contributions! Please read our contributing guidelines before submitting PRs.

## 📄 License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).
