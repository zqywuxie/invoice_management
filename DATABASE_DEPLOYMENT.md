# Database Deployment Guide

This project now supports two database backends:

- `SQLite` (default, local development)
- `PostgreSQL` (recommended for server deployment)

## Why switch from SQLite on server

SQLite is file-based and works well for local/single-user scenarios, but server deployments typically need:

- Better concurrent writes
- Stronger connection handling across worker processes
- Easier backup/replication strategies

PostgreSQL is a better fit for these requirements.

## Configuration

The backend is selected by environment variable `DATABASE_URL`.

- Default (no env set): local SQLite file `data/invoices.db`
- SQLite explicit: `sqlite:///data/invoices.db`
- SQLite memory: `sqlite:///:memory:`
- PostgreSQL: `postgresql://username:password@host:5432/database`

Optional PostgreSQL pool settings:

- `DB_POOL_MIN` (default `1`)
- `DB_POOL_MAX` (default `10`)

## Recommended env-file layout

This repository now supports separate runtime env files:

- `.env.local` for local development
- `.env.server` for remote server deployment

The application resolves env files in this order:

1. `ENV_FILE`, if explicitly set
2. `.env.local`
3. `.env.server`
4. `.env`

Existing process environment variables are not overridden by the file loader.

Suggested setup:

```powershell
Copy-Item .env.local.example .env.local
Copy-Item .env.server.example .env.server
```

Local SQLite example:

```env
DATABASE_URL=sqlite:///data/invoices.db
APP_PORT=5000
```

Server PostgreSQL example:

```env
DATABASE_URL=postgresql://invoice_user:change-this-password@127.0.0.1:5432/invoice_db
APP_PORT=5001
DB_POOL_MIN=2
DB_POOL_MAX=20
```

## Example (PowerShell)

```powershell
$env:DATABASE_URL="postgresql://postgres:your_password@127.0.0.1:5432/invoice_db"
$env:DB_POOL_MIN="2"
$env:DB_POOL_MAX="20"
python invoice_web/run.py --host 0.0.0.0 --port 5000
```

## Docker Compose (Recommended for Server)

1. Copy env template:

```powershell
Copy-Item .env.server.example .env.server
```

2. Edit `.env.server` and set strong passwords/secrets.

3. Start services:

```powershell
docker compose --env-file .env.server up -d --build
```

4. Check health:

```powershell
curl http://127.0.0.1:5001/healthz
```

## Notes

- The app preserves the existing data access methods, so most business code stays unchanged.
- For production, do not keep plaintext passwords in shell history; prefer secure secret management.
- If `DATABASE_URL` is set to PostgreSQL but `psycopg2-binary` is missing, startup will raise a clear error.

## Migrate Existing SQLite Data

Use the built-in migration script:

```powershell
$env:ENV_FILE=".env.server"
python scripts/migrate_sqlite_to_postgres.py `
  --sqlite-path data/invoices.db
```

Behavior:

- Default: target PostgreSQL tables are truncated before import.
- Add `--no-truncate` to keep existing rows and skip duplicates.

If you use Docker Compose, run migration inside web container:

```powershell
docker compose --env-file .env.server run --rm web python scripts/migrate_sqlite_to_postgres.py `
  --sqlite-path data/invoices.db
```
