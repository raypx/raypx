# @raypx/auth

Authentication system based on **Better Auth**

## Features

- ✅ Email/password login
- ✅ Session management
- ✅ Cookie cache
- ✅ Password hashing (bcrypt)
- ✅ CSRF protection
- ✅ Type safety
- ✅ Drizzle ORM integration
- ✅ Automatic logging

## Installation

```bash
bun add better-auth
```

## Usage

### 1. Setup Auth Routes

```typescript
// apps/web/src/routes/api.auth.$.ts
import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@raypx/auth';

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      async POST({ request }) {
        return auth.handler(request);
      },
      async GET({ request }) {
        return auth.handler(request);
      },
    },
  },
});
```

### 2. Register User

```typescript
// Client
const response = await fetch('/api/auth/sign-up', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePassword123',
    name: 'John Doe',
  }),
});

const data = await response.json();
console.log(data.user); // User info
```

### 3. Login

```typescript
const response = await fetch('/api/auth/sign-in', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePassword123',
  }),
});

const data = await response.json();
// Session cookie automatically set
```

### 4. Logout

```typescript
await fetch('/api/auth/sign-out', {
  method: 'POST',
});
```

### 5. Protect API Routes

```typescript
// apps/web/src/routes/api.protected.ts
import { createFileRoute } from '@tanstack/react-router';
import { requireAuth } from '@raypx/auth';

export const Route = createFileRoute('/api/protected')({
  server: {
    handlers: {
      async GET({ request }) {
        const session = await requireAuth(request);
        if (session instanceof Response) return session; // Unauthenticated

        // User authenticated
        return Response.json({
          message: 'Protected data',
          user: session.user,
        });
      },
    },
  },
});
```

### 6. Get Current User

```typescript
import { getSession } from '@raypx/auth';

export async function handler({ request }) {
  const session = await getSession(request);
  
  if (!session) {
    return Response.json({ user: null });
  }
  
  return Response.json({ user: session.user });
}
```

## React Hook (Optional)

```typescript
// packages/hooks/src/auth.ts
import { useState, useEffect } from 'react';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        setUser(data.user);
        setLoading(false);
      });
  }, []);

  const signIn = async (email: string, password: string) => {
    const res = await fetch('/api/auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.user) setUser(data.user);
    return data;
  };

  const signOut = async () => {
    await fetch('/api/auth/sign-out', { method: 'POST' });
    setUser(null);
  };

  return { user, loading, signIn, signOut };
}
```

## Database Schema

Better Auth automatically creates the following tables:

- `user` - User information
- `session` - Sessions
- `account` - OAuth accounts (if enabled)
- `verification` - Email verification

Run migrations:

```bash
cd packages/auth
bun drizzle-kit generate
bun drizzle-kit migrate
```

## Configuration Options

```typescript
// packages/auth/src/index.ts
export const auth = betterAuth({
  // Database adapter
  database: drizzleAdapter(getDatabase(), {
    provider: "sqlite",
  }),
  
  // Email/password auth
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true, // Recommended for production
    minPasswordLength: 8,
  },
  
  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update once per day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60, // 1 hour
    },
  },
  
  // Cookie configuration
  advanced: {
    cookiePrefix: "raypx",
    crossSubDomainCookies: {
      enabled: false,
    },
  },
});
```

## Security Recommendations

1. **Enable HTTPS in production**
2. **Enable email verification** - `requireEmailVerification: true`
3. **Set strong password policy** - `minPasswordLength: 12`
4. **Use environment variables** - Store secrets and configuration
5. **Enable Rate Limiting** - Prevent brute force attacks
6. **Regularly update dependencies** - Keep security patches current

## API Endpoints

Better Auth automatically provides the following endpoints:

- `POST /api/auth/sign-up` - Register
- `POST /api/auth/sign-in` - Login
- `POST /api/auth/sign-out` - Logout
- `GET /api/auth/session` - Get current session
- `POST /api/auth/forget-password` - Forgot password
- `POST /api/auth/reset-password` - Reset password

## Testing

```typescript
// packages/auth/test/auth.test.ts
import { describe, it, expect } from 'vitest';
import { auth } from '../src';

describe('Auth', () => {
  it('should create auth instance', () => {
    expect(auth).toBeDefined();
  });
  
  // More tests...
});
```

## Migrating to Other Databases

If migrating to PostgreSQL in the future:

```typescript
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg", // Change to PostgreSQL
  }),
  // ...
});
```

---

**Complete authentication system, ready to use!** 🔐
