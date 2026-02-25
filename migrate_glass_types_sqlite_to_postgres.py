"""Migrate glass_types from local SQLite (backend/data.db) to Render PostgreSQL."""
import os
import sys
import sqlite3
from sqlalchemy import create_engine, MetaData, Table

SQLITE_PATH = os.path.join("backend", "data.db")
POSTGRES_URL = os.environ.get("POSTGRES_URL")


def migrate() -> None:
    if not POSTGRES_URL:
        print("❌ POSTGRES_URL not set. Provide the external PostgreSQL URL.")
        sys.exit(1)

    if not os.path.exists(SQLITE_PATH):
        print(f"❌ SQLite file not found: {SQLITE_PATH}")
        sys.exit(1)

    print("=" * 70)
    print("SQLite (data.db) → PostgreSQL (glass_types)")
    print("=" * 70)

    # Read from SQLite
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    cursor = sqlite_conn.cursor()
    cursor.execute(
        "SELECT id, name, description, texture_url, is_active, display_order, created_at, updated_at "
        "FROM glass_types ORDER BY display_order ASC, id ASC"
    )
    rows = [dict(row) for row in cursor.fetchall()]
    sqlite_conn.close()

    if not rows:
        print("❌ No rows found in SQLite glass_types")
        sys.exit(1)

    # Create tables in Postgres via SQLAlchemy models
    os.environ["DATABASE_URL"] = POSTGRES_URL
    from backend.app import create_app

    app = create_app()
    with app.app_context():
        from backend.models import db
        db.create_all()

    # Insert into Postgres
    engine = create_engine(POSTGRES_URL, echo=False)
    meta = MetaData()
    meta.reflect(bind=engine)

    if "glass_types" not in meta.tables:
        print("❌ glass_types table not found in Postgres")
        sys.exit(1)

    table = Table("glass_types", meta, autoload_with=engine)

    with engine.begin() as conn:
        conn.execute(table.delete())
        conn.execute(table.insert(), rows)

    print(f"✅ Inserted {len(rows)} glass_types rows into Postgres")


if __name__ == "__main__":
    migrate()
