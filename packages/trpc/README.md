# @raypx/trpc

tRPC server package for raypx monorepo.

## Structure

```
src/
├── init.ts           # tRPC instance initialization
├── router.ts         # Root router
├── client.ts         # Client-side React hooks
├── routers/          # Sub-routers by feature
│   └── todos.ts
└── index.ts          # Main exports
```

## Usage

### Server-side

```typescript
import { trpcRouter } from "@raypx/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

// In your API route
fetchRequestHandler({
  req: request,
  router: trpcRouter,
  endpoint: "/api/trpc",
});
```

### Client-side

```typescript
import { TRPCProvider, useTRPC } from "@raypx/trpc/client";

// Wrap your app with TRPCProvider
function App() {
  return (
    <TRPCProvider>
      <YourComponent />
    </TRPCProvider>
  );
}

// Use in components
function YourComponent() {
  const { data } = useTRPC.todos.list.useQuery();
  const mutation = useTRPC.todos.add.useMutation();
}
```

## Adding New Routers

1. Create a new router in `src/routers/`
2. Export it from the router file
3. Add it to the root router in `src/router.ts`
4. Export it from `src/index.ts`
