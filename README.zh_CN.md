# Raypx

[![Version](https://img.shields.io/github/package-json/v/raypx/raypx?style=flat-square)](https://github.com/raypx/raypx)
[![License](https://img.shields.io/github/license/raypx/raypx?style=flat-square)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)](https://reactjs.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-red?style=flat-square&logo=turborepo)](https://turbo.build/)
[![Biome](https://img.shields.io/badge/Biome-linter%20%26%20formatter-yellow?style=flat-square&logo=biome)](https://biomejs.dev/)
![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/raypx/raypx?utm_source=oss&utm_medium=github&utm_campaign=raypx%2Fraypx&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

> 基于 Next.js 和 TypeScript 构建的现代化 Web 应用平台，专注于构建 AI 驱动的应用程序。

## 🚀 快速开始

访问 [raypx.com](https://dub.sh/raypx) 开始使用平台。

## 📚 文档

完整的文档请访问 [docs.raypx.com](https://docs.raypx.com)。

## 🛠️ 技术栈

- **框架**: Next.js 15.4.5 with React 19
- **语言**: TypeScript 5.8.3
- **包管理器**: pnpm 10.14.0
- **Monorepo**: Turborepo
- **UI 组件**: Radix UI + Tailwind CSS (shadcn/ui)
- **数据库**: Drizzle ORM
- **身份验证**: 自定义认证系统
- **邮件服务**: Nodemailer
- **缓存**: Redis
- **代码质量**: Biome (代码检查和格式化)
- **Git 钩子**: Husky + Commitlint

## 📁 项目结构

```
raypx/
├── apps/
│   ├── web/          # 主要的 Next.js 应用
│   └── docs/         # 文档站点 (Fumadocs)
├── packages/         # 共享包
│   ├── ui/           # UI 组件库
│   ├── auth/         # 身份验证系统
│   ├── db/           # 数据库层 (Drizzle)
│   ├── email/        # 邮件服务
│   └── ...           # 其他工具包
└── tooling/          # 开发工具和配置
```

## 🤝 贡献

我们欢迎贡献！请在提交 PR 之前阅读我们的贡献指南。

## 📄 许可证

本项目基于 [MIT 许可证](https://opensource.org/licenses/MIT) 开源。