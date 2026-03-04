import pytest

from src import database_factory
from src.sqlite_data_store import SQLiteDataStore


def test_create_data_store_defaults_to_sqlite(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    store = database_factory.create_data_store(":memory:")

    assert isinstance(store, SQLiteDataStore)
    assert store.db_path == ":memory:"


def test_create_data_store_with_sqlite_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")

    store = database_factory.create_data_store("unused.db")

    assert isinstance(store, SQLiteDataStore)
    assert store.db_path == ":memory:"


def test_create_data_store_invalid_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "mysql://user:pass@localhost/test")

    with pytest.raises(ValueError):
        database_factory.create_data_store("data/invoices.db")


def test_create_data_store_postgres_uses_pool_env(monkeypatch):
    captured = {}

    class FakePostgresStore:
        def __init__(self, database_url, min_conn, max_conn):
            captured["database_url"] = database_url
            captured["min_conn"] = min_conn
            captured["max_conn"] = max_conn

    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/db")
    monkeypatch.setenv("DB_POOL_MIN", "3")
    monkeypatch.setenv("DB_POOL_MAX", "7")
    monkeypatch.setattr(database_factory, "PostgreSQLDataStore", FakePostgresStore)

    store = database_factory.create_data_store("unused.db")

    assert isinstance(store, FakePostgresStore)
    assert captured == {
        "database_url": "postgresql://user:pass@localhost:5432/db",
        "min_conn": 3,
        "max_conn": 7,
    }
