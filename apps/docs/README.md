# Raypx Documentation

This is the documentation site for [Raypx](https://github.com/raypx/raypx), built with Fumadocs and TanStack Start.

## Features

- 📝 **MDX Support** - Write documentation with React components
- 🔍 **Search** - Built-in search functionality
- 📱 **Responsive** - Mobile-friendly design
- ⚡ **Fast** - Optimized performance with CSS preloading
- 🎨 **Customizable** - Easy to customize with Tailwind CSS

## Development

```bash
# Install dependencies (from root)
pnpm install

# Start development server
pnpm run dev:docs

# Build for production
pnpm run build:docs

# Preview production build
pnpm run start
```

The documentation site will be available at `http://localhost:3004` during development.

## Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start)
- **Documentation**: [Fumadocs](https://fumadocs.dev)
- **UI Components**: [@raypx/ui](../../packages/ui)
- **Styling**: [Tailwind CSS](https://tailwindcss.com) (with minification)
- **Performance**: CSS preloading and optimized asset delivery

## Project Structure

```
apps/docs/
├── content/
│   └── docs/          # Documentation content (MDX)
├── public/            # Static assets (images, icons)
├── src/
│   ├── components/    # React components
│   │   ├── default-catch-boundary.tsx
│   │   ├── loading.tsx
│   │   ├── logo.tsx
│   │   ├── mdx-components.tsx
│   │   └── not-found.tsx
│   ├── config/        # Configuration files
│   │   └── base.ts
│   ├── routes/        # File-based routing
│   │   ├── __root.tsx
│   │   └── api/       # API routes
│   └── styles/        # Global styles
└── source.config.ts   # Fumadocs configuration
```

## Adding Content

Documentation pages are written in MDX format in the `content/docs/` directory.

### Creating a New Page

1. Create a new `.mdx` file in `content/docs/`
2. Add frontmatter with title and description:

```mdx
---
title: Your Page Title
description: Page description
---

# Your Page Title

Your content here...
```

3. The page will be automatically available in the navigation

### Using Components

You can use React components in MDX files:

```mdx
import { Button } from "@raypx/ui/components/button"

<Button>Click me</Button>
```

## Configuration

The documentation site is configured in `source.config.ts`. You can customize:

- Navigation structure
- Theme settings
- Search configuration
- Custom components

## License

MIT