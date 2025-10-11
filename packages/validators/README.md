# @raypx/validators

Shared validation schemas using Zod for the raypx monorepo.

## Purpose

This package provides reusable Zod validation schemas that can be used across both frontend and backend code. By centralizing validation logic, we ensure:

- **Consistency**: Same validation rules everywhere
- **Type Safety**: Full TypeScript support with Zod's inferred types
- **No Circular Dependencies**: Keeps validation logic separate from business logic
- **Easy Maintenance**: Single source of truth for validation rules

## Installation

This is an internal workspace package. To use it in another package:

```json
{
  "dependencies": {
    "@raypx/validators": "workspace:*"
  }
}
```

## Usage

### Basic Example

```typescript
import { emailSchema, passwordSchema, paginationSchema } from "@raypx/validators";

// Validate user input
const email = emailSchema.parse("user@example.com");

// Validate with error handling
const result = passwordSchema.safeParse("weak");
if (!result.success) {
  console.error(result.error);
}

// Use in API routes
const { page, limit } = paginationSchema.parse(req.query);
```

### Available Validators

#### Common Validators

- `emailSchema` - Email address validation
- `passwordSchema` - Password with minimum requirements
- `usernameSchema` - Username with alphanumeric + hyphens/underscores
- `paginationSchema` - Page and limit parameters for pagination
- `idSchema` - Database record ID validation
- `urlSchema` - URL validation
- `optionalString` - Optional string that transforms empty strings to undefined
- `dateRangeSchema` - Date range with start/end validation

### Adding New Validators

When adding new validators:

1. Create a new file in `src/` for your domain (e.g., `user.ts`, `post.ts`)
2. Export your schemas from that file
3. Re-export from `src/index.ts`

```typescript
// src/user.ts
import { z } from "zod";
import { emailSchema, passwordSchema } from "./common";

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1),
});

// src/index.ts
export * from "./common";
export * from "./user";
```

## Best Practices

1. **Keep validators pure**: Don't include business logic or database calls
2. **Use descriptive error messages**: Help users understand what went wrong
3. **Compose schemas**: Reuse common validators to build complex ones
4. **Document requirements**: Add JSDoc comments explaining validation rules
5. **Type inference**: Use `z.infer<typeof schema>` to get TypeScript types

## Integration with Other Packages

### With tRPC

```typescript
import { createUserSchema } from "@raypx/validators";

export const userRouter = router({
  create: publicProcedure
    .input(createUserSchema)
    .mutation(async ({ input }) => {
      // input is fully typed!
    }),
});
```

### With React Hook Form

```typescript
import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchema } from "@raypx/validators";

const form = useForm({
  resolver: zodResolver(createUserSchema),
});
```

## License

Apache-2.0
