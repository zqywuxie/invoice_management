"""
PostgreSQL-backed data store.

This module keeps the existing `SQLiteDataStore` method surface and SQL usage
style, so upper layers can switch database backend with minimal code changes.
"""

from __future__ import annotations

import importlib
import re
import sqlite3
from typing import Any, List, Optional, Sequence, Tuple

from src.sqlite_data_store import SQLiteDataStore


_PRAGMA_TABLE_INFO_RE = re.compile(
    r"^\s*PRAGMA\s+table_info\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*;?\s*$",
    re.IGNORECASE,
)
_INSERT_TABLE_RE = re.compile(
    r"^\s*INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)",
    re.IGNORECASE,
)
_ID_TABLES = {
    "users",
    "invoices",
    "expense_vouchers",
    "reimbursement_persons",
    "contracts",
    "electronic_signatures",
    "signature_templates",
}


def _replace_qmark_placeholders(sql: str) -> str:
    """
    Convert SQLite qmark placeholders (?) to PostgreSQL format placeholders (%s).
    """
    result: List[str] = []
    in_single = False
    in_double = False
    i = 0
    while i < len(sql):
        ch = sql[i]
        if ch == "'" and not in_double:
            # Handle escaped single quote in SQL string literals.
            if in_single and i + 1 < len(sql) and sql[i + 1] == "'":
                result.append("''")
                i += 2
                continue
            in_single = not in_single
            result.append(ch)
        elif ch == '"' and not in_single:
            in_double = not in_double
            result.append(ch)
        elif ch == "?" and not in_single and not in_double:
            result.append("%s")
        else:
            result.append(ch)
        i += 1
    return "".join(result)


def _translate_sql_for_postgres(sql: str) -> str:
    """
    Translate SQLite-flavored SQL into PostgreSQL-compatible SQL.
    """
    translated = sql
    translated = re.sub(
        r"INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT",
        "SERIAL PRIMARY KEY",
        translated,
        flags=re.IGNORECASE,
    )
    translated = re.sub(r"\bBLOB\b", "BYTEA", translated, flags=re.IGNORECASE)
    if re.match(r"^\s*ALTER\s+TABLE\s+.+\s+ADD\s+COLUMN\s+", translated, flags=re.IGNORECASE):
        # SQLite allows adding a column with REFERENCES before referenced table exists.
        # PostgreSQL enforces dependency checks immediately, so relax it for migration compatibility.
        translated = re.sub(
            r"\s+REFERENCES\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^)]+\)",
            "",
            translated,
            flags=re.IGNORECASE,
        )
    translated = _replace_qmark_placeholders(translated)
    return translated


class _PostgreSQLCursorAdapter:
    """
    Cursor adapter that emulates a subset of sqlite3 cursor behavior.
    """

    def __init__(self, raw_cursor: Any, psycopg2_module: Any):
        self._cursor = raw_cursor
        self._psycopg2 = psycopg2_module
        self._fake_rows: Optional[List[Tuple[Any, ...]]] = None
        self._lastrowid: Optional[int] = None

    def execute(self, sql: str, params: Optional[Sequence[Any]] = None):
        self._fake_rows = None
        self._lastrowid = None

        pragma_rows = self._handle_pragma(sql)
        if pragma_rows is not None:
            self._fake_rows = pragma_rows
            return self

        translated_sql = _translate_sql_for_postgres(sql)
        normalized_sql = sql.strip()
        insert_match = _INSERT_TABLE_RE.match(normalized_sql)
        needs_returning_id = False
        if insert_match and "RETURNING" not in normalized_sql.upper():
            table = insert_match.group(1).lower()
            if table in _ID_TABLES:
                needs_returning_id = True
                translated_sql = translated_sql.rstrip().rstrip(";") + " RETURNING id"

        try:
            if params is None:
                self._cursor.execute(translated_sql)
            else:
                self._cursor.execute(translated_sql, tuple(params))
            if needs_returning_id:
                row = self._cursor.fetchone()
                self._lastrowid = int(row[0]) if row else None
        except self._psycopg2.IntegrityError as exc:
            raise sqlite3.IntegrityError(str(exc)) from exc

        return self

    def fetchone(self):
        if self._fake_rows is not None:
            if not self._fake_rows:
                return None
            return self._fake_rows.pop(0)
        return self._cursor.fetchone()

    def fetchall(self):
        if self._fake_rows is not None:
            rows = list(self._fake_rows)
            self._fake_rows = []
            return rows
        return self._cursor.fetchall()

    @property
    def lastrowid(self) -> Optional[int]:
        return self._lastrowid

    @property
    def rowcount(self) -> int:
        if self._fake_rows is not None:
            return len(self._fake_rows)
        return self._cursor.rowcount

    def close(self) -> None:
        self._cursor.close()

    def _handle_pragma(self, sql: str) -> Optional[List[Tuple[Any, ...]]]:
        normalized = sql.strip()
        if not normalized.upper().startswith("PRAGMA "):
            return None

        # SQLite-specific PRAGMAs can be ignored in PostgreSQL.
        if normalized.upper().startswith("PRAGMA FOREIGN_KEYS"):
            return []
        if normalized.upper().startswith("PRAGMA BUSY_TIMEOUT"):
            return []
        if normalized.upper().startswith("PRAGMA JOURNAL_MODE"):
            return []
        if normalized.upper().startswith("PRAGMA SYNCHRONOUS"):
            return []

        table_info_match = _PRAGMA_TABLE_INFO_RE.match(normalized)
        if not table_info_match:
            return []

        table_name = table_info_match.group(1)
        self._cursor.execute(
            """
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = %s
            ORDER BY ordinal_position
            """,
            (table_name,),
        )
        columns = self._cursor.fetchall()

        self._cursor.execute(
            """
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            WHERE tc.table_schema = current_schema()
              AND tc.table_name = %s
              AND tc.constraint_type = 'PRIMARY KEY'
            """,
            (table_name,),
        )
        pk_columns = {row[0] for row in self._cursor.fetchall()}

        rows: List[Tuple[Any, ...]] = []
        for idx, (column_name, data_type, is_nullable, column_default) in enumerate(columns):
            rows.append(
                (
                    idx,  # cid
                    column_name,  # name
                    data_type,  # type
                    1 if is_nullable == "NO" else 0,  # notnull
                    column_default,  # dflt_value
                    1 if column_name in pk_columns else 0,  # pk
                )
            )
        return rows

    def __getattr__(self, name: str) -> Any:
        return getattr(self._cursor, name)


class _PostgreSQLConnectionAdapter:
    """
    Connection adapter that mimics sqlite3 connection context behavior.
    """

    def __init__(self, pool: Any, psycopg2_module: Any):
        self._pool = pool
        self._psycopg2 = psycopg2_module
        self._conn = self._pool.getconn()
        self._released = False

    def cursor(self) -> _PostgreSQLCursorAdapter:
        return _PostgreSQLCursorAdapter(self._conn.cursor(), self._psycopg2)

    def execute(self, sql: str, params: Optional[Sequence[Any]] = None):
        cursor = self.cursor()
        cursor.execute(sql, params)
        return cursor

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        if not self._released:
            self._pool.putconn(self._conn)
            self._released = True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if exc_type is None:
                self._conn.commit()
            else:
                self._conn.rollback()
        finally:
            self.close()
        return False


class PostgreSQLDataStore(SQLiteDataStore):
    """
    Data store that reuses SQLiteDataStore logic against PostgreSQL.
    """

    DEFAULT_POOL_MIN = 1
    DEFAULT_POOL_MAX = 10

    def __init__(self, database_url: str, min_conn: int = DEFAULT_POOL_MIN, max_conn: int = DEFAULT_POOL_MAX):
        if not database_url:
            raise ValueError("database_url is required for PostgreSQLDataStore")
        if min_conn < 1 or max_conn < min_conn:
            raise ValueError("Invalid connection pool size configuration")

        self.db_path = database_url
        self._database_url = database_url
        self._memory_keeper = None
        self._memory_uri = None
        self._is_memory_db = False
        self._psycopg2 = self._load_psycopg2()
        self._pool = self._psycopg2.pool.ThreadedConnectionPool(
            minconn=min_conn,
            maxconn=max_conn,
            dsn=database_url,
        )
        self._init_database()

    @staticmethod
    def _load_psycopg2():
        try:
            psycopg2_module = importlib.import_module("psycopg2")
            pool_module = importlib.import_module("psycopg2.pool")
        except ImportError as exc:
            raise RuntimeError(
                "PostgreSQL backend requires `psycopg2-binary`. Install it with: pip install psycopg2-binary"
            ) from exc
        psycopg2_module.pool = pool_module
        return psycopg2_module

    def _ensure_data_dir(self) -> None:
        # Not needed for PostgreSQL.
        return None

    def _configure_connection(self, conn) -> None:
        # SQLite PRAGMA settings are not applicable in PostgreSQL.
        return None

    def _get_connection(self) -> _PostgreSQLConnectionAdapter:
        return _PostgreSQLConnectionAdapter(self._pool, self._psycopg2)

    def close(self) -> None:
        if hasattr(self, "_pool"):
            self._pool.closeall()

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass
