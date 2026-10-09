# Quick Docker Reference

## Development

```bash
# Start dev environment with hot reload
docker compose -f docker-compose.dev.yml up

# Rebuild after dependency changes
docker compose -f docker-compose.dev.yml up --build
```

## Production

```bash
# Start production (detached)
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

## Useful Commands

```bash
# Shell access
docker compose exec app sh

# Run tests
docker compose exec app bun test

# Database backup
docker cp raypx-app:/app/data/raypx.db ./backup.db

# View health
curl http://localhost:3000/api/health

# Restart
docker compose restart app

# Clean everything
docker compose down -v
docker system prune -a
```

## Ports

- **3000** - Application
- **80** - Nginx HTTP
- **443** - Nginx HTTPS (configure SSL first)
- **5173** - Vite HMR (dev only)

## Volumes

- **raypx-data** - SQLite database persistence
- **./logs** - Application logs (optional)

---

See [docs/DOCKER.md](docs/DOCKER.md) for complete documentation.
