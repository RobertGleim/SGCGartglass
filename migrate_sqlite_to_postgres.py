"""Migrate SQLAlchemy model tables from local SQLite to Render PostgreSQL."""
import os
import sys
from sqlalchemy import create_engine, MetaData, Table, select

# Source: local SQLite used by SQLAlchemy models
SQLITE_URL = "sqlite:///backend/designer.db"

# Destination: Render PostgreSQL (external URL)
POSTGRES_URL = os.environ.get("POSTGRES_URL")

TABLE_ORDER = [
    "glass_types",
    "templates",
    "template_regions",
    "user_projects",
    "work_orders",
    "work_order_status_history",
]


def migrate() -> None:
    if not POSTGRES_URL:
        print("❌ POSTGRES_URL not set. Provide the external PostgreSQL URL.")
        sys.exit(1)

    print("=" * 70)
    print("SQLite → PostgreSQL Migration (SQLAlchemy tables)")
    print("=" * 70)
    print(f"Source: {SQLITE_URL}")
    print(f"Destination: {POSTGRES_URL[:60]}...")

    sqlite_engine = create_engine(SQLITE_URL, echo=False)
    postgres_engine = create_engine(POSTGRES_URL, echo=False)

    # Create schema in Postgres from SQLAlchemy models
    os.environ["DATABASE_URL"] = POSTGRES_URL
    from backend.app import create_app
    app = create_app()
    with app.app_context():
        from backend.models import db
        db.create_all()

    sqlite_meta = MetaData()
    sqlite_meta.reflect(bind=sqlite_engine)
    postgres_meta = MetaData()
    postgres_meta.reflect(bind=postgres_engine)

    total_rows = 0
    for table_name in TABLE_ORDER:
        if table_name not in sqlite_meta.tables:
            print(f"⚠️  Skipping missing source table: {table_name}")
            continue
        if table_name not in postgres_meta.tables:
            print(f"⚠️  Skipping missing destination table: {table_name}")
            continue

        print(f"\n📊 Migrating {table_name}...")
        src_table = Table(table_name, sqlite_meta, autoload_with=sqlite_engine)
        dst_table = Table(table_name, postgres_meta, autoload_with=postgres_engine)

        with sqlite_engine.connect() as src_conn:
            rows = src_conn.execute(select(src_table)).fetchall()

        if not rows:
            print("  ⏭️  No rows to migrate")
            continue

        # Clear destination table to avoid duplicates
        with postgres_engine.begin() as dst_conn:
            dst_conn.execute(dst_table.delete())

        data = [dict(row._mapping) for row in rows]
        with postgres_engine.begin() as dst_conn:
            dst_conn.execute(dst_table.insert(), data)

        print(f"  ✅ Inserted {len(data)} rows")
        total_rows += len(data)

    print("\n=" * 35)
    print(f"✅ Migration complete! Total rows inserted: {total_rows}")


if __name__ == "__main__":
    migrate()
