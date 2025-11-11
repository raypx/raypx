# @raypx/trpc

Type-safe tRPC server setup with comprehensive error handling.

## Features

- ✅ **End-to-end type safety** with TypeScript
- ✅ **Automatic error logging** with contextual information
- ✅ **Performance monitoring** for slow requests
- ✅ **Standardized error codes** for consistent error handling
- ✅ **Rich error utilities** for common scenarios
- ✅ **Better Auth integration** for authentication
- ✅ **Drizzle ORM integration** for database access

## Structure

```
src/
├── trpc.ts              # tRPC instance initialization & context
├── router.ts            # Root router
├── client.ts            # Client-side React hooks
├── errors.ts            # Error codes and error factories
├── routers/             # Sub-routers by feature
│   └── users.ts
├── middlewares/         # tRPC middlewares
│   └── error-logger.ts  # Error logging & performance monitoring
├── utils/               # Utility functions
│   └── error-handler.ts # Error handling helpers
└── index.ts             # Main exports
```

## Server-Side Usage

### Basic Router Definition

```typescript
import { publicProcedure, protectedProcedure } from "@raypx/trpc";
import { z } from "zod";

export const myRouter = {
  // Public endpoint
  list: publicProcedure.query(({ ctx }) => {
    return ctx.db.query.items.findMany();
  }),

  // Protected endpoint
  create: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.insert(items).values(input);
    }),
};
```

### Error Handling

#### Using Error Utilities

```typescript
import { Errors, assertExists } from "@raypx/trpc";
import { eq } from "@raypx/db";

export const getUser = publicProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    const user = await ctx.db.query.user.findFirst({
      where: eq(User.id, input.id),
    });

    // Throw NOT_FOUND if user doesn't exist
    assertExists(user, () => Errors.userNotFound(input.id));

    return user;
  });
```

#### Handling Database Errors

```typescript
import { handleDatabaseError } from "@raypx/trpc";

export const createUser = protectedProcedure
  .input(CreateUserSchema)
  .mutation(async ({ ctx, input }) => {
    try {
      return await ctx.db.insert(User).values(input);
    } catch (error) {
      // Automatically handles:
      // - Unique constraint violations → DUPLICATE_RESOURCE
      // - Foreign key violations → BUSINESS_RULE_VIOLATION
      // - Not null violations → BAD_REQUEST
      throw handleDatabaseError(error, "create user");
    }
  });
```

#### Permission Checks

```typescript
import { assertOwnership, Errors, assertExists } from "@raypx/trpc";

export const deletePost = protectedProcedure
  .input(z.string())
  .mutation(async ({ ctx, input }) => {
    const post = await ctx.db.query.post.findFirst({
      where: eq(Post.id, input),
    });

    assertExists(post, () => Errors.resourceNotFound("Post", input));

    // Check if user owns the resource
    assertOwnership(ctx.session.user.id, post.authorId, "Post", input);

    await ctx.db.delete(Post).where(eq(Post.id, input));
    return { success: true };
  });
```

#### Custom Errors

```typescript
import { createAppError, AppErrorCode } from "@raypx/trpc";

throw createAppError(
  AppErrorCode.BUSINESS_RULE_VIOLATION,
  "Insufficient balance for transfer",
  {
    context: { balance, requested, deficit },
  },
);
```

## Client-Side Usage

### Basic Setup

```typescript
import { TRPCProvider, useTRPC } from "@raypx/trpc/client";

function App() {
  return (
    <TRPCProvider client={trpcClient} queryClient={queryClient}>
      <YourComponent />
    </TRPCProvider>
  );
}
```

### Error Handling in Components

```typescript
import { useTRPC } from "@raypx/trpc/client";
import type { TRPCClientError } from "@trpc/client";

function UserProfile({ userId }: { userId: string }) {
  const trpc = useTRPC();
  const userQuery = trpc((t) => t.users.byId.useQuery({ id: userId }));

  if (userQuery.error) {
    const error = userQuery.error as TRPCClientError<AppRouter>;

    // Check error code
    if (error.data?.code === "NOT_FOUND") {
      return <div>User not found</div>;
    }

    if (error.data?.code === "UNAUTHORIZED") {
      return <div>Please log in</div>;
    }

    return <div>Error: {error.message}</div>;
  }

  return <div>Hello, {userQuery.data.name}!</div>;
}
```

### Handling Mutation Errors

```typescript
import { useTRPC } from "@raypx/trpc/client";
import { AppErrorCode } from "@raypx/trpc";
import { toast } from "sonner";

function CreateUserForm() {
  const trpc = useTRPC();
  const createMutation = trpc((t) =>
    t.users.create.useMutation({
      onSuccess: () => {
        toast.success("User created!");
      },
      onError: (error) => {
        const meta = error.data?.cause as ErrorMeta | undefined;

        if (meta?.code === AppErrorCode.DUPLICATE_RESOURCE) {
          toast.error("Email already exists");
          return;
        }

        if (error.data?.zodError) {
          // Handle validation errors
          const fieldErrors = error.data.zodError.fieldErrors;
          // Show field-specific errors
        }

        toast.error(error.message);
      },
    }),
  );

  return <form onSubmit={/* ... */}>/* ... */</form>;
}
```

## Error Codes Reference

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `USER_NOT_FOUND` | 404 | User doesn't exist |
| `RESOURCE_NOT_FOUND` | 404 | Resource not found |
| `INSUFFICIENT_PERMISSIONS` | 403 | Lacks permissions |
| `RESOURCE_ACCESS_DENIED` | 403 | Cannot access resource |
| `INVALID_INPUT` | 400 | Validation failed |
| `DUPLICATE_RESOURCE` | 400 | Already exists |
| `BUSINESS_RULE_VIOLATION` | 422 | Business rule violated |
| `OPERATION_NOT_ALLOWED` | 422 | Operation not permitted |
| `DATABASE_ERROR` | 500 | Database error |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |

## Available Error Utilities

### Assertions

- `assertExists(value, errorFactory)` - Assert value is not null/undefined
- `assertCondition(condition, errorFactory)` - Assert condition is true
- `assertPermission(hasPermission, action, resource)` - Check permissions
- `assertOwnership(userId, ownerId, resourceType, resourceId)` - Check ownership

### Error Handling

- `handleDatabaseError(error, operation)` - Map database errors to application errors
- `withErrorHandling(operation, options)` - Wrap operations with error handling
- `retryWithBackoff(operation, options)` - Retry with exponential backoff

### Validation

- `validateNonEmpty(array, message)` - Ensure array has items
- `safeJsonParse(jsonString, errorMessage)` - Parse JSON with error handling

### Error Factories

```typescript
import { Errors } from "@raypx/trpc";

// Pre-built error factories
Errors.userNotFound(userId);
Errors.resourceNotFound(type, id);
Errors.insufficientPermissions(action, resource);
Errors.accessDenied(type, id);
Errors.duplicateResource(type, identifier);
Errors.businessRuleViolation(rule, details);
Errors.operationNotAllowed(operation, reason);
Errors.databaseError(operation, cause);
Errors.rateLimitExceeded(limit, window);
Errors.internalError(message, cause);
```

## Logging

### Error Logs

All errors are automatically logged:

```
[tRPC Error] QUERY users.byId | Code: USER_NOT_FOUND | Message: User with ID '123' not found | User: abc-456
```

### Performance Logs

Slow requests (>3000ms) are logged:

```
[tRPC Slow Request] QUERY users.all took 4523ms
```

Configure threshold:

```typescript
import { performanceLoggingMiddleware } from "@raypx/trpc";

// Log requests slower than 1000ms
export const myProcedure = t.procedure
  .use(performanceLoggingMiddleware(1000))
  .query(/* ... */);
```

## Adding New Routers

1. Create router in `src/routers/`

```typescript
// src/routers/posts.ts
import { publicProcedure, protectedProcedure } from "../trpc";
import { Errors, assertExists } from "../errors";

export const postsRouter = {
  list: publicProcedure.query(({ ctx }) => {
    return ctx.db.query.post.findMany();
  }),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const post = await ctx.db.query.post.findFirst({
        where: eq(Post.id, input.id),
      });
      assertExists(post, () => Errors.resourceNotFound("Post", input.id));
      return post;
    }),
};
```

2. Add to root router

```typescript
// src/router.ts
import { postsRouter } from "./routers/posts";

export const trpcRouter = createTRPCRouter({
  users: usersRouter,
  posts: postsRouter, // Add here
});
```

3. Export from index

```typescript
// src/index.ts
export { postsRouter } from "./routers/posts";
```

## Internationalization (i18n)

All error messages support internationalization through translation keys.

### Server-Side

Errors automatically include translation keys:

```typescript
import { Errors } from "@raypx/trpc";

// This error includes translationKey: "errors.userNotFound"
throw Errors.userNotFound("user-123");

// Error metadata structure:
// {
//   code: AppErrorCode.USER_NOT_FOUND,
//   translationKey: "errors.userNotFound",
//   translationParams: { userId: "user-123" },
//   context: { userId: "user-123" },
//   timestamp: Date
// }
```

### Client-Side

Use `useErrorMessage` hook to get localized error messages:

```typescript
import { useErrorMessage, useError } from "~/hooks/use-error-message";

function UserProfile({ userId }: { userId: string }) {
  const query = trpc.users.byId.useQuery({ id: userId });

  if (query.error) {
    // Automatically translated based on user's language
    const message = useErrorMessage(query.error);
    return <div>Error: {message}</div>;
  }

  return <div>Hello, {query.data.name}!</div>;
}
```

### Translation Files

Add translations in `apps/web/messages/*.json`:

```json
// messages/en.json
{
  "errors": {
    "userNotFound": "User with ID '{userId}' not found",
    "resourceNotFound": "{resourceType} with ID '{resourceId}' not found"
  }
}

// messages/zh.json
{
  "errors": {
    "userNotFound": "未找到 ID 为 '{userId}' 的用户",
    "resourceNotFound": "未找到 ID 为 '{resourceId}' 的{resourceType}"
  }
}
```

### Advanced Error Handling

```typescript
import { useError, getErrorMessageForCode } from "~/hooks/use-error-message";
import { toast } from "sonner";

function CreateUserForm() {
  const createMutation = trpc.users.create.useMutation({
    onError: (error) => {
      // Option 1: Use custom translation key (from Errors.*)
      const message = useErrorMessage(error);

      // Option 2: Use error code fallback
      const codeMessage = getErrorMessageForCode(error.data?.code);

      // Option 3: Prefer code-based translation
      const preferredMessage = useError(error, {
        preferCode: true,
        fallback: "Failed to create user",
      });

      toast.error(preferredMessage);
    },
  });

  return <form>...</form>;
}
```

### Available Translation Keys

All `Errors.*` factory functions automatically include translation keys:

- `errors.userNotFound` - User not found
- `errors.resourceNotFound` - Generic resource not found
- `errors.insufficientPermissions` - Permission denied
- `errors.accessDenied` - Resource access denied
- `errors.duplicateResource` - Resource already exists
- `errors.businessRuleViolation` - Business rule violated
- `errors.operationNotAllowed` - Operation not allowed
- `errors.databaseError` - Database error
- `errors.rateLimitExceeded` - Rate limit exceeded
- `errors.internalError` - Internal server error

Generic tRPC error codes also have translations:

- `errors.unauthorized` - Authentication required (401)
- `errors.forbidden` - Permission denied (403)
- `errors.notFound` - Resource not found (404)
- `errors.conflict` - Resource conflict (409)
- `errors.tooManyRequests` - Rate limit (429)
- `errors.internalError` - Server error (500)

### Example Components

See `apps/web/src/components/examples/error-handling-example.tsx` for complete examples:

- Simple error alerts
- Error with retry button
- Query error handlers
- Mutation error handlers with Zod validation
- Inline form errors
- Toast notifications
- Error boundary fallbacks

## Best Practices

1. ✅ Use specific error factories from `Errors` object
2. ✅ Always validate resources exist with `assertExists`
3. ✅ Check permissions with `assertOwnership` or `assertPermission`
4. ✅ Handle database errors with `handleDatabaseError`
5. ✅ Provide context in error metadata
6. ✅ Use type guards for type-safe error handling on client
7. ✅ Use `useErrorMessage` hook for i18n on client
8. ✅ Add translations for all custom error messages
9. ❌ Don't expose sensitive data in error messages
10. ❌ Don't create raw `TRPCError` when utilities exist
