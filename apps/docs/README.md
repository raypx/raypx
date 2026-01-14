# Raypx Documentation

This is the documentation site for [Raypx](https://github.com/yourusername/raypx).

## Development

```bash
# Install dependencies
bun install

# Start development server
bun dev

# Build for production
bun run build

# Preview production build
bun run start
```

## Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start)
- **Documentation**: [Fumadocs](https://fumadocs.dev)
- **UI Components**: [@raypx/ui](../../packages/ui)
- **Styling**: [Tailwind CSS](https://tailwindcss.com)

## Project Structure

```
apps/docs/
├── content/
│   └── docs/          # Documentation content (MDX)
├── src/
│   ├── components/    # React components
│   ├── config/        # Configuration files
│   └── routes/        # File-based routing
└── source.config.ts   # Fumadocs configuration
```

## Adding Content

Documentation pages are written in MDX format in the `content/docs/` directory.

## License

MIT