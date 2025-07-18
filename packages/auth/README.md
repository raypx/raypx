# @raypx/auth

Authentication package built on top of BetterAuth.

## Quick Start

### Environment Variables

```env
# Required
NEXT_PUBLIC_AUTH_URL=http://localhost:3000
AUTH_SECRET=your-secret-key
REDIS_URL=redis://localhost:6379

# Optional - Email
RESEND_FROM=noreply@yourdomain.com
AUTH_RESEND_KEY=re_your_resend_key

# Optional - GitHub OAuth
AUTH_GITHUB_ID=your_github_client_id
AUTH_GITHUB_SECRET=your_github_client_secret
NEXT_PUBLIC_AUTH_GITHUB_ENABLED=true

# Optional - Google OAuth
AUTH_GOOGLE_ID=your_google_client_id
AUTH_GOOGLE_SECRET=your_google_client_secret
NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true
NEXT_PUBLIC_AUTH_GOOGLE_ID=your_google_client_id

# Optional - Cross-domain cookies
AUTH_DOMAIN=.yourdomain.com
```

### Server Setup

```typescript
// app/api/auth/[...auth]/route.ts
import { auth } from "@raypx/auth"

export const { GET, POST } = auth
```

### Client Setup

```typescript
import { useSession, signIn, signOut } from "@raypx/auth/client"

export function AuthButton() {
  const { data: session, isLoading } = useSession()

  if (isLoading) return <div>Loading...</div>

  if (session) {
    return (
      <div>
        <p>Welcome, {session.user.name}!</p>
        <button onClick={() => signOut()}>Sign Out</button>
      </div>
    )
  }

  return (
    <button onClick={() => signIn("github")}>
      Sign in with GitHub
    </button>
  )
}
```

## API Reference

```typescript
// Server-side
export { auth } from "@raypx/auth"
export { toNextJsHandler } from "@raypx/auth/server"

// Client-side
export { client, signIn, signUp, useSession, signOut } from "@raypx/auth/client"

// Types
export type { Session, User } from "@raypx/auth/types"

// Utilities
export { envs } from "@raypx/auth/envs"
export { checkSessionCookie } from "@raypx/auth/middleware"
```
