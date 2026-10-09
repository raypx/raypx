/**
 * Main API router using Hono
 *
 * Provides type-safe REST API endpoints
 */

import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { createLogger } from '@raypx/logger';

const logger = createLogger({ name: 'api' });

/**
 * Main API application
 */
const api = new Hono()
  .use('*', honoLogger())
  .get('/health', (c) => {
    logger.debug('Health check requested');

    return c.json({
      status: 'ok',
      service: 'raypx-api',
      timestamp: new Date().toISOString(),
    });
  });

export type ApiType = typeof api;
export default api;
