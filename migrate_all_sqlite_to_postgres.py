"""Migrate both legacy and SQLAlchemy SQLite data into PostgreSQL.

Usage (PowerShell):
  $env:POSTGRES_URL="postgresql://..."
  c:/Users/rglei/OneDrive/Desktop/Sgcg/.venv/Scripts/python.exe migrate_all_sqlite_to_postgres.py
"""

import os
import sys
from pathlib import Path
from sqlalchemy import create_engine, MetaData, Table, select, text

ROOT = Path(__file__).parent
LEGACY_SQLITE_URL = f"sqlite:///{ROOT / 'backend' / 'data.db'}"
DESIGNER_SQLITE_URL = f"sqlite:///{ROOT / 'backend' / 'designer.db'}"
POSTGRES_URL = os.environ.get("POSTGRES_URL") or os.environ.get("DATABASE_URL")

LEGACY_TABLES = [
    "items",
    "manual_products",
    "product_images",
    "customers",
    "customer_addresses",
    "customer_favorites",
    "customer_cart_items",
    "customer_orders",
    "customer_order_items",
    "customer_reviews",
]

DESIGNER_TABLES = [
    "glass_types",
    "templates",
    "template_regions",
    "user_projects",
    "work_orders",
    "work_order_status_history",
]


def _normalize_postgres_url(url: str) -> str:
    normalized = url.strip()
    if normalized.startswith("postgresql+psycopg://"):
        return normalized.replace("postgresql+psycopg://", "postgresql://", 1)
    if normalized.startswith("postgres://"):
        return normalized.replace("postgres://", "postgresql://", 1)
    return normalized


def _copy_tables(source_url: str, target_engine, tables: list[str]) -> int:
    source_engine = create_engine(source_url, echo=False)
    source_meta = MetaData()
    source_meta.reflect(bind=source_engine)

    target_meta = MetaData()
    target_meta.reflect(bind=target_engine)

    inserted = 0
    for table_name in tables:
        if table_name not in source_meta.tables:
            print(f"⚠️  Source table missing, skipping: {table_name}")
            continue
        if table_name not in target_meta.tables:
            print(f"⚠️  Target table missing, skipping: {table_name}")
            continue

        src_table = Table(table_name, source_meta, autoload_with=source_engine)
        dst_table = Table(table_name, target_meta, autoload_with=target_engine)

        with source_engine.connect() as conn:
            rows = conn.execute(select(src_table)).fetchall()

        if not rows:
            print(f"⏭️  {table_name}: no rows")
            continue

        payload = [dict(row._mapping) for row in rows]
        with target_engine.begin() as conn:
            conn.execute(dst_table.delete())
            conn.execute(dst_table.insert(), payload)

            # Reset sequence for id column if present
            if "id" in dst_table.c:
                seq_name = f"{table_name}_id_seq"
                # Use raw SQL string to avoid SQLAlchemy parameter parsing issues
                reset_sql = f"SELECT setval('{seq_name}'::regclass, COALESCE((SELECT MAX(id) FROM {table_name}), 1), true)"
                conn.execute(text(reset_sql))

        print(f"✅ {table_name}: inserted {len(payload)}")
        inserted += len(payload)

    return inserted


def main() -> None:
    if not POSTGRES_URL:
        print("❌ Set POSTGRES_URL (or DATABASE_URL) to your PostgreSQL connection string.")
        sys.exit(1)

    target_url = _normalize_postgres_url(POSTGRES_URL)
    target_engine = create_engine(target_url, echo=False)

    # Ensure SQLAlchemy-managed schema exists first.
    os.environ["DATABASE_URL"] = target_url
    os.environ["APP_ENV"] = "production"
    from backend.app import create_app
    app = create_app()
    with app.app_context():
        from backend.models import db
        db.create_all()

    print("=" * 72)
    print("SQLite -> PostgreSQL full migration")
    print("=" * 72)
    print(f"Legacy source:   {LEGACY_SQLITE_URL}")
    print(f"Designer source: {DESIGNER_SQLITE_URL}")
    print(f"Target:          {target_url[:80]}...")

    total = 0
    total += _copy_tables(LEGACY_SQLITE_URL, target_engine, LEGACY_TABLES)
    total += _copy_tables(DESIGNER_SQLITE_URL, target_engine, DESIGNER_TABLES)

    print("=" * 72)
    print(f"✅ Complete. Total rows migrated: {total}")


if __name__ == "__main__":
    main()
