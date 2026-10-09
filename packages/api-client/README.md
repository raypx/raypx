# @raypx/api-client

Type-safe API client using Hono's `hc` (HTTP client).

## Features

- ✅ **End-to-end type safety** - Types flow from server to client
- ✅ **Auto-completion** - Full IDE support
- ✅ **REST semantics** - Standard HTTP methods
- ✅ **Zero codegen** - Types inferred automatically
- ✅ **Error handling** - Type-safe error responses

## Quick Start

```typescript
import { apiClient, getUsers, getUser } from '@raypx/api-client';

// Method 1: Direct client usage
const res = await apiClient.users.$get();
const users = await res.json(); // Fully typed!

// Method 2: Helper functions
const users = await getUsers();
const user = await getUser('123');
```

## API Reference

### `apiClient`

Direct access to the type-safe Hono client.

```typescript
import { apiClient } from '@raypx/api-client';

// GET /api/users
const res = await apiClient.users.$get();
const users = await res.json();

// GET /api/users/:id
const res = await apiClient.users[':id'].$get({
  param: { id: '123' }
});
const user = await res.json();

// POST /api/users
const res = await apiClient.users.$post({
  json: { name: 'John', email: 'john@example.com' }
});
const newUser = await res.json();

// DELETE /api/users/:id
const res = await apiClient.users[':id'].$delete({
  param: { id: '123' }
});
```

### Helper Functions

#### `healthCheck()`

Check API health status.

```typescript
const health = await healthCheck();
console.log(health.status); // "ok"
```

#### `getUsers()`

Get all users.

```typescript
const users = await getUsers();
console.log(users); // User[]
```

#### `getUser(id)`

Get user by ID.

```typescript
try {
  const user = await getUser('123');
  console.log(user.name);
} catch (error) {
  console.error('User not found');
}
```

#### `createUser(data)`

Create a new user.

```typescript
const user = await createUser({
  name: 'John Doe',
  email: 'john@example.com'
});
```

#### `deleteUser(id)`

Delete a user.

```typescript
await deleteUser('123');
```

## Usage in Components

```typescript
import { getUsers, createUser } from '@raypx/api-client';
import { useState, useEffect } from 'react';

function UserList() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    getUsers().then(setUsers);
  }, []);

  const handleCreate = async () => {
    const newUser = await createUser({
      name: 'New User',
      email: 'new@example.com'
    });
    
    setUsers([...users, newUser]);
  };

  return (
    <div>
      {users.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
      <button onClick={handleCreate}>Add User</button>
    </div>
  );
}
```

## Error Handling

```typescript
import { getUser } from '@raypx/api-client';

try {
  const user = await getUser('invalid-id');
} catch (error) {
  if (error.message === 'User not found') {
    // Handle 404
  } else {
    // Handle other errors
  }
}
```

## Type Safety

The client automatically infers types from the server:

```typescript
// Server defines this route:
app.get('/users/:id', (c) => {
  return c.json({ id: 1, name: 'John', email: 'john@example.com' });
});

// Client knows the exact return type!
const res = await apiClient.users[':id'].$get({ param: { id: '1' } });
const user = await res.json();

// TypeScript knows:
user.id     // number
user.name   // string
user.email  // string
user.foo    // ❌ Type error - property doesn't exist
```

## Adding New Endpoints

1. **Define route in server:**

```typescript
// apps/web/server/api/routes/posts.ts
export const postRoutes = new Hono()
  .get('/', (c) => c.json([/* posts */]))
  .get('/:id', (c) => c.json({ id: 1, title: 'Post' }));
```

2. **Mount in main API:**

```typescript
// apps/web/server/api/index.ts
import { postRoutes } from './routes/posts';

const api = new Hono()
  .route('/posts', postRoutes);
```

3. **Use in client (types flow automatically):**

```typescript
// Anywhere in your app
const res = await apiClient.posts.$get();
const posts = await res.json(); // Typed!
```

---

**Type-safe REST APIs made simple** 🎯
