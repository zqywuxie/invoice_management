#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Migrate data from SQLite to PostgreSQL.

Usage:
  python scripts/migrate_sqlite_to_postgres.py --sqlite-path data/invoices.db --postgres-url postgresql://...

Notes:
  - By default, target PostgreSQL tables are truncated before import.
  - Use --no-truncate if you want to merge into existing data (duplicate rows are skipped).
"""

import argparse
import os
import sqlite3
import sys
from typing import Dict, List, Sequence, Tuple


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.env_loader import load_project_env
from src.postgres_data_store import PostgreSQLDataStore
from src.sqlite_data_store import SQLiteDataStore

load_project_env(PROJECT_ROOT)


TABLE_COLUMNS: Dict[str, List[str]] = {
    "users": ["id", "username", "password_hash", "display_name", "created_at", "is_admin"],
    "user_preferences": ["username", "pref_key", "pref_value", "updated_at"],
    "reimbursement_persons": ["id", "name", "created_time"],
    "invoices": [
        "id",
        "invoice_number",
        "invoice_date",
        "item_name",
        "amount",
        "remark",
        "file_path",
        "scan_time",
        "pdf_data",
        "uploaded_by",
        "reimbursement_person_id",
        "reimbursement_status",
        "record_type",
    ],
    "expense_vouchers": ["id", "invoice_number", "file_path", "original_filename", "upload_time"],
    "contracts": ["id", "invoice_number", "file_path", "original_filename", "upload_time"],
    "electronic_signatures": [
        "id",
        "invoice_number",
        "image_path",
        "original_filename",
        "position_x",
        "position_y",
        "width",
        "height",
        "page_number",
        "upload_time",
    ],
    "signature_templates": ["id", "name", "image_path", "original_filename", "upload_time"],
}

ID_TABLES = [
    "users",
    "invoices",
    "expense_vouchers",
    "reimbursement_persons",
    "contracts",
    "electronic_signatures",
    "signature_templates",
]

TRUNCATE_ORDER = [
    "electronic_signatures",
    "contracts",
    "expense_vouchers",
    "invoices",
    "user_preferences",
    "users",
    "reimbursement_persons",
    "signature_templates",
]


def parse_args():
    parser = argparse.ArgumentParser(description="Migrate SQLite data to PostgreSQL")
    parser.add_argument(
        "--sqlite-path",
        default=os.path.join("data", "invoices.db"),
        help="Path to SQLite database file (default: data/invoices.db)",
    )
    parser.add_argument(
        "--postgres-url",
        default=os.environ.get("DATABASE_URL", ""),
        help="PostgreSQL DATABASE_URL. If omitted, read from DATABASE_URL env var.",
    )
    parser.add_argument(
        "--no-truncate",
        action="store_true",
        help="Do not truncate target tables before migration (duplicates will be skipped).",
    )
    return parser.parse_args()


def truncate_target_tables(postgres_store: PostgreSQLDataStore) -> None:
    with postgres_store._get_connection() as conn:
        cursor = conn.cursor()
        sql = (
            "TRUNCATE TABLE "
            + ", ".join(TRUNCATE_ORDER)
            + " RESTART IDENTITY CASCADE"
        )
        cursor.execute(sql)
        conn.commit()


def copy_table(
    sqlite_store: SQLiteDataStore,
    postgres_store: PostgreSQLDataStore,
    table_name: str,
    columns: Sequence[str],
) -> Tuple[int, int]:
    col_sql = ", ".join(columns)
    placeholders = ", ".join(["?"] * len(columns))
    select_sql = f"SELECT {col_sql} FROM {table_name}"
    insert_sql = f"INSERT INTO {table_name} ({col_sql}) VALUES ({placeholders})"

    inserted = 0
    skipped = 0
    with sqlite_store._get_connection() as source_conn:
        source_cursor = source_conn.cursor()
        source_cursor.execute(select_sql)
        rows = source_cursor.fetchall()

    if not rows:
        return inserted, skipped

    with postgres_store._get_connection() as target_conn:
        target_cursor = target_conn.cursor()
        for row in rows:
            try:
                target_cursor.execute(insert_sql, row)
                target_conn.commit()
                inserted += 1
            except sqlite3.IntegrityError:
                target_conn.rollback()
                skipped += 1
            except Exception:
                target_conn.rollback()
                skipped += 1

    return inserted, skipped


def reset_postgres_sequences(postgres_store: PostgreSQLDataStore) -> None:
    with postgres_store._get_connection() as conn:
        cursor = conn.cursor()
        for table in ID_TABLES:
            cursor.execute(
                f"""
                SELECT setval(
                    pg_get_serial_sequence(?, 'id'),
                    COALESCE(MAX(id), 1),
                    MAX(id) IS NOT NULL
                )
                FROM {table}
                """,
                (table,),
            )
        conn.commit()


def main():
    args = parse_args()

    if not args.postgres_url:
        raise SystemExit("PostgreSQL URL is required. Provide --postgres-url or set DATABASE_URL.")
    if not (args.postgres_url.startswith("postgresql://") or args.postgres_url.startswith("postgres://")):
        raise SystemExit("Invalid --postgres-url. It must start with postgresql:// or postgres://")
    if not os.path.exists(args.sqlite_path):
        raise SystemExit(f"SQLite file not found: {args.sqlite_path}")

    sqlite_store = SQLiteDataStore(args.sqlite_path)
    postgres_store = PostgreSQLDataStore(args.postgres_url)

    print(f"[INFO] Source SQLite: {args.sqlite_path}")
    print("[INFO] Target PostgreSQL: configured")

    if not args.no_truncate:
        print("[INFO] Truncating target tables...")
        truncate_target_tables(postgres_store)

    total_inserted = 0
    total_skipped = 0

    for table, columns in TABLE_COLUMNS.items():
        inserted, skipped = copy_table(
            sqlite_store=sqlite_store,
            postgres_store=postgres_store,
            table_name=table,
            columns=columns,
        )
        total_inserted += inserted
        total_skipped += skipped
        print(f"[INFO] {table}: inserted={inserted}, skipped={skipped}")

    print("[INFO] Resetting PostgreSQL sequences...")
    reset_postgres_sequences(postgres_store)

    print("[DONE] Migration completed.")
    print(f"[DONE] Total inserted={total_inserted}, skipped={total_skipped}")


if __name__ == "__main__":
    main()
