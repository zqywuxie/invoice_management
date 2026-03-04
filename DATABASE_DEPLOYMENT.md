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
Copy-Item .env.example .env
```

2. Edit `.env` and set strong passwords/secrets.

3. Start services:

```powershell
docker compose up -d --build
```

4. Check health:

```powershell
curl http://127.0.0.1:5000/healthz
```

## Notes

- The app preserves the existing data access methods, so most business code stays unchanged.
- For production, do not keep plaintext passwords in shell history; prefer secure secret management.
- If `DATABASE_URL` is set to PostgreSQL but `psycopg2-binary` is missing, startup will raise a clear error.

## Migrate Existing SQLite Data

Use the built-in migration script:

```powershell
python scripts/migrate_sqlite_to_postgres.py `
  --sqlite-path data/invoices.db `
  --postgres-url "postgresql://postgres:your_password@127.0.0.1:5432/invoice_db"
```

Behavior:

- Default: target PostgreSQL tables are truncated before import.
- Add `--no-truncate` to keep existing rows and skip duplicates.

If you use Docker Compose, run migration inside web container:

```powershell
docker compose run --rm web python scripts/migrate_sqlite_to_postgres.py `
  --sqlite-path data/invoices.db `
  --postgres-url "postgresql://${env:POSTGRES_USER}:${env:POSTGRES_PASSWORD}@db:5432/${env:POSTGRES_DB}"
```
