"""
Database backend factory.

Environment variables:
    DATABASE_URL:
      - sqlite:///relative/or/absolute/path.db
      - sqlite:///:memory:
      - postgresql://user:pass@host:port/dbname
      - postgres://user:pass@host:port/dbname
    DB_POOL_MIN: minimum PostgreSQL pool size (default 1)
    DB_POOL_MAX: maximum PostgreSQL pool size (default 10)
"""

from __future__ import annotations

import os

from src.postgres_data_store import PostgreSQLDataStore
from src.sqlite_data_store import SQLiteDataStore


def _parse_int_env(name: str, default: int) -> int:
    value = os.environ.get(name, "").strip()
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _sqlite_path_from_url(database_url: str) -> str:
    if database_url == "sqlite:///:memory:":
        return ":memory:"
    return database_url.replace("sqlite:///", "", 1)


def create_data_store(default_sqlite_path: str) -> SQLiteDataStore:
    """
    Create a configured data store.

    When DATABASE_URL is not set, falls back to local SQLite path.
    """
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        return SQLiteDataStore(default_sqlite_path)

    if database_url.startswith("sqlite:///") or database_url == "sqlite:///:memory:":
        sqlite_path = _sqlite_path_from_url(database_url)
        return SQLiteDataStore(sqlite_path)

    if database_url.startswith("postgresql://") or database_url.startswith("postgres://"):
        pool_min = max(_parse_int_env("DB_POOL_MIN", 1), 1)
        pool_max = max(_parse_int_env("DB_POOL_MAX", 10), pool_min)
        return PostgreSQLDataStore(database_url=database_url, min_conn=pool_min, max_conn=pool_max)

    raise ValueError(
        "Unsupported DATABASE_URL. Use sqlite:///..., sqlite:///:memory:, or postgresql://..."
    )


def describe_backend() -> str:
    """
    Return a safe backend description for logs without leaking credentials.
    """
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        return "sqlite (default local file)"
    if database_url.startswith("sqlite:///:memory:"):
        return "sqlite (memory)"
    if database_url.startswith("sqlite:///"):
        return "sqlite (DATABASE_URL)"
    if database_url.startswith("postgresql://") or database_url.startswith("postgres://"):
        return "postgresql (DATABASE_URL)"
    return "unknown (DATABASE_URL)"
