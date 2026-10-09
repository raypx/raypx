/**
 * User API routes
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDatabase } from '@raypx/db';
import { users } from '@raypx/db/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '@raypx/logger';

const logger = createLogger({ name: 'api:users' });

/**
 * User creation schema
 */
const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

/**
 * User routes
 */
export const userRoutes = new Hono()
  .get('/', async (c) => {
    logger.debug('Fetching all users');

    const db = getDatabase();
    const allUsers = await db.select().from(users);

    return c.json(allUsers);
  })
  .get('/:id', async (c) => {
    const id = parseInt(c.req.param('id'));

    logger.debug('Fetching user', { id });

    const db = getDatabase();
    const [user] = await db.select().from(users).where(eq(users.id, id));

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json(user);
  })
  .post('/', zValidator('json', createUserSchema), async (c) => {
    const data = c.req.valid('json');

    logger.info('Creating user', { email: data.email });

    const db = getDatabase();
    const [newUser] = await db.insert(users).values(data).returning();

    return c.json(newUser, 201);
  })
  .delete('/:id', async (c) => {
    const id = parseInt(c.req.param('id'));

    logger.info('Deleting user', { id });

    const db = getDatabase();
    await db.delete(users).where(eq(users.id, id));

    return c.json({ success: true });
  });
