/**
 * Type-safe API client using Hono client
 */

import { hc } from 'hono/client';
import type { ApiType } from '../../apps/web/server/api';

/**
 * Create API client with type inference
 *
 * @example
 * ```typescript
 * import { apiClient } from '@raypx/api-client';
 *
 * // Fully typed!
 * const res = await apiClient.users.$get();
 * const users = await res.json();
 *
 * // Create user
 * const res = await apiClient.users.$post({
 *   json: { name: 'John', email: 'john@example.com' }
 * });
 * ```
 */
export const apiClient = hc<ApiType>('/api');

/**
 * Health check
 */
export async function healthCheck() {
  const res = await apiClient.health.$get();
  return res.json();
}

/**
 * Get all users
 */
export async function getUsers() {
  const res = await apiClient.users.$get();
  return res.json();
}

/**
 * Get user by ID
 */
export async function getUser(id: string) {
  const res = await apiClient.users[':id'].$get({
    param: { id },
  });

  if (!res.ok) {
    throw new Error('User not found');
  }

  return res.json();
}

/**
 * Create user
 */
export async function createUser(data: { name: string; email: string }) {
  const res = await apiClient.users.$post({
    json: data,
  });

  return res.json();
}

/**
 * Delete user
 */
export async function deleteUser(id: string) {
  const res = await apiClient.users[':id'].$delete({
    param: { id },
  });

  return res.json();
}
