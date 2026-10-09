#!/usr/bin/env bun

/**
 * Interactive project setup script
 *
 * Guides users through initial configuration with prompts
 */

import { intro, outro, text, select, confirm, spinner } from '@clack/prompts';
import { writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

async function setup() {
  console.clear();

  intro('🚀 Raypx Setup');

  // Project name
  const projectName = await text({
    message: 'What is your project name?',
    placeholder: 'my-app',
    validate: (value) => {
      if (!value) return 'Project name is required';
      if (!/^[a-z0-9-]+$/.test(value)) {
        return 'Use lowercase letters, numbers, and hyphens only';
      }
    },
  });

  // Database choice
  const database = await select({
    message: 'Choose your database',
    options: [
      {
        value: 'sqlite',
        label: 'SQLite',
        hint: 'Simple, file-based (recommended for development)'
      },
      {
        value: 'postgres',
        label: 'PostgreSQL',
        hint: 'Production-ready, requires setup'
      },
    ],
  });

  // Redis for caching
  const useRedis = await confirm({
    message: 'Use Redis for caching?',
    initialValue: false,
  });

  // Generate secret
  const sessionSecret = crypto.randomUUID();

  // Create .env file
  const s = spinner();
  s.start('Creating configuration...');

  let envContent = `# Database
DATABASE_PATH=./data/${projectName}.db

# Authentication
SESSION_SECRET=${sessionSecret}
COOKIE_DOMAIN=localhost

# Application
NODE_ENV=development
PORT=3000
`;

  if (database === 'postgres') {
    envContent += `
# PostgreSQL (update with your credentials)
DATABASE_URL=postgresql://user:password@localhost:5432/${projectName}
`;
  }

  if (useRedis) {
    envContent += `
# Redis
REDIS_URL=redis://localhost:6379
`;
  }

  writeFileSync('.env', envContent);
  s.stop('Configuration created');

  // Install dependencies if needed
  if (!existsSync('node_modules')) {
    const s2 = spinner();
    s2.start('Installing dependencies...');

    try {
      execSync('bun install', { stdio: 'ignore' });
      s2.stop('Dependencies installed');
    } catch (error) {
      s2.stop('Failed to install dependencies');
      console.error('Please run: bun install');
    }
  }

  // Run database migrations
  const runMigrations = await confirm({
    message: 'Run database migrations now?',
    initialValue: true,
  });

  if (runMigrations) {
    const s3 = spinner();
    s3.start('Running migrations...');

    try {
      execSync('cd packages/db && bun drizzle-kit migrate', { stdio: 'ignore' });
      s3.stop('Migrations complete');
    } catch (error) {
      s3.stop('Migrations skipped (run manually: cd packages/db && bun drizzle-kit migrate)');
    }
  }

  outro(`✨ Setup complete!

Next steps:
  1. Review .env configuration
  ${database === 'postgres' ? '2. Update PostgreSQL connection string\n  ' : ''}${useRedis ? '3. Start Redis (docker run -d -p 6379:6379 redis:alpine)\n  ' : ''}${runMigrations ? '' : '2. Run migrations: cd packages/db && bun drizzle-kit migrate\n  '}3. Start development: bun run dev

Visit: http://localhost:3000
`);
}

setup().catch(console.error);
