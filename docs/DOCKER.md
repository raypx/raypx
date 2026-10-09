# Docker Deployment Guide

## Quick Start

### Development

```bash
# Start development environment
docker compose -f docker-compose.dev.yml up

# Or build and run
docker compose -f docker-compose.dev.yml up --build

# Stop
docker compose -f docker-compose.dev.yml down
```

Access: http://localhost:3000

### Production

```bash
# Start production environment
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Stop and remove volumes (WARNING: deletes database)
docker compose down -v
```

Access: http://localhost (via Nginx)

## Architecture

```
┌─────────────┐
│   Nginx     │  :80, :443
│  (Reverse   │
│   Proxy)    │
└──────┬──────┘
       │
┌──────▼──────┐
│  Raypx App  │  :3000
│   (Bun)     │
└──────┬──────┘
       │
┌──────▼──────┐
│   SQLite    │
│  (Volume)   │
└─────────────┘
```

## Build Options

### Multi-stage Production Build

```bash
# Build production image
docker build -t raypx:latest .

# Run container
docker run -p 3000:3000 \
  -v raypx-data:/app/data \
  -e NODE_ENV=production \
  raypx:latest
```

### Development Build

```bash
# Build dev image
docker build -f Dockerfile.dev -t raypx:dev .

# Run with source mounted
docker run -p 3000:3000 \
  -v $(pwd):/app \
  -v /app/node_modules \
  raypx:dev
```

## Environment Variables

```bash
# Required
NODE_ENV=production
PORT=3000

# Database
DATABASE_PATH=/app/data/raypx.db

# Authentication (optional)
SESSION_SECRET=your-secret-key
COOKIE_DOMAIN=yourdomain.com

# Logging
LOG_LEVEL=info
```

### Using .env file

```bash
# Create .env file
cat > .env << EOF
NODE_ENV=production
PORT=3000
DATABASE_PATH=/app/data/raypx.db
SESSION_SECRET=$(openssl rand -base64 32)
EOF

# Use in docker-compose.yml
services:
  app:
    env_file: .env
```

## Volumes

### Persist Database

```yaml
volumes:
  - raypx-data:/app/data
```

Database location: `/app/data/raypx.db`

### Backup Database

```bash
# Backup
docker compose exec app bun run -e "require('fs').copyFileSync('/app/data/raypx.db', '/app/data/raypx-backup.db')"

# Copy to host
docker cp raypx-app:/app/data/raypx.db ./backup/raypx-$(date +%Y%m%d).db

# Restore
docker cp ./backup/raypx-20240101.db raypx-app:/app/data/raypx.db
docker compose restart app
```

## Health Checks

Built-in health check endpoint: `/api/health`

```bash
# Check health
curl http://localhost:3000/api/health

# Response
{"status":"ok","service":"raypx"}
```

Docker health check runs every 30s:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3000/api/health')..."
```

## Production Deployment

### With SSL (Let's Encrypt)

1. Get SSL certificates:

```bash
# Using certbot
certbot certonly --standalone -d yourdomain.com

# Copy certificates
mkdir -p ssl
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/cert.pem
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/key.pem
```

2. Update `nginx.conf` - uncomment HTTPS section

3. Start with SSL:

```bash
docker compose up -d
```

### Scaling

```bash
# Scale app instances
docker compose up -d --scale app=3

# Nginx will load balance automatically
```

### Monitoring

```bash
# View logs
docker compose logs -f app

# View all logs
docker compose logs -f

# Resource usage
docker stats raypx-app

# Inspect container
docker inspect raypx-app
```

## Development Workflow

### Hot Reload

Development setup includes hot reload:

```bash
# Start dev environment
docker compose -f docker-compose.dev.yml up

# Make code changes - server auto-restarts
# Visit http://localhost:3000
```

### Run Commands in Container

```bash
# Shell access
docker compose exec app sh

# Run tests
docker compose exec app bun test

# Type check
docker compose exec app bun run typecheck

# Database migrations
docker compose exec app bun run -e "require('@raypx/db').migrate()"
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs app

# Check health
docker inspect raypx-app --format='{{json .State.Health}}'
```

### Database locked

```bash
# Stop all containers
docker compose down

# Remove volume (WARNING: deletes data)
docker volume rm raypx_raypx-data

# Restart
docker compose up -d
```

### Permission issues

```bash
# Fix ownership
docker compose exec -u root app chown -R bun:nodejs /app/data
```

### Out of disk space

```bash
# Clean up
docker system prune -a --volumes

# Remove unused images
docker image prune -a
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Build image
        run: docker build -t raypx:latest .
      
      - name: Push to registry
        run: |
          echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
          docker push raypx:latest
      
      - name: Deploy to server
        run: |
          ssh user@server "cd /app && docker compose pull && docker compose up -d"
```

## Security Best Practices

1. **Use secrets management**
   ```bash
   docker secret create session_secret secret.txt
   ```

2. **Run as non-root user** (already configured)

3. **Regular updates**
   ```bash
   docker compose pull
   docker compose up -d
   ```

4. **Network isolation**
   ```yaml
   networks:
     raypx-network:
       driver: bridge
   ```

5. **Resource limits**
   ```yaml
   services:
     app:
       deploy:
         resources:
           limits:
             cpus: '1'
             memory: 512M
   ```

---

**Production-ready Docker deployment for Raypx** 🐳
