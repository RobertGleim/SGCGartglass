import os
import sqlite3
from datetime import datetime


def get_db():
    db_path = os.environ.get(
        "DB_PATH",
        os.path.join(os.path.dirname(__file__), "data.db"),
    )
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            etsy_listing_id TEXT NOT NULL UNIQUE,
            title TEXT,
            description TEXT,
            price_amount TEXT,
            price_currency TEXT,
            image_url TEXT,
            etsy_url TEXT,
            updated_at TEXT
        )
        """
    )
    conn.commit()
    conn.close()


def upsert_item(payload):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO items (
            etsy_listing_id,
            title,
            description,
            price_amount,
            price_currency,
            image_url,
            etsy_url,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(etsy_listing_id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            price_amount = excluded.price_amount,
            price_currency = excluded.price_currency,
            image_url = excluded.image_url,
            etsy_url = excluded.etsy_url,
            updated_at = excluded.updated_at
        """,
        (
            payload["etsy_listing_id"],
            payload.get("title"),
            payload.get("description"),
            payload.get("price_amount"),
            payload.get("price_currency"),
            payload.get("image_url"),
            payload.get("etsy_url"),
            datetime.utcnow().isoformat(),
        ),
    )
    conn.commit()
    item_id = cursor.lastrowid
    conn.close()
    return item_id


def fetch_items():
    conn = get_db()
    cursor = conn.cursor()
    rows = cursor.execute("SELECT * FROM items ORDER BY updated_at DESC").fetchall()
    conn.close()
    return [dict(row) for row in rows]


def fetch_item(item_id):
    conn = get_db()
    cursor = conn.cursor()
    row = cursor.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(row) if row else None
