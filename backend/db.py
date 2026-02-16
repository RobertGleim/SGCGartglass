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
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS manual_products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT,
            materials TEXT,
            width REAL,
            height REAL,
            depth REAL,
            price REAL NOT NULL,
            quantity INTEGER NOT NULL,
            is_featured INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS product_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            image_url TEXT NOT NULL,
            media_type TEXT DEFAULT 'image',
            display_order INTEGER DEFAULT 0,
            FOREIGN KEY (product_id) REFERENCES manual_products(id) ON DELETE CASCADE
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


def create_manual_product(payload):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    
    cursor.execute(
        """
        INSERT INTO manual_products (
            name, description, category, materials,
            width, height, depth, price, quantity, is_featured,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload["name"],
            payload["description"],
            payload.get("category"),
            payload.get("materials"),
            payload.get("width"),
            payload.get("height"),
            payload.get("depth"),
            payload["price"],
            payload["quantity"],
            1 if payload.get("is_featured") else 0,
            now,
            now,
        ),
    )
    product_id = cursor.lastrowid
    
    # Insert images if provided
    images = payload.get("images", [])
    for idx, image in enumerate(images):
        cursor.execute(
            """
            INSERT INTO product_images (product_id, image_url, media_type, display_order)
            VALUES (?, ?, ?, ?)
            """,
            (product_id, image["url"], image.get("type", "image"), idx)
        )
    
    conn.commit()
    conn.close()
    return product_id


def fetch_manual_products():
    conn = get_db()
    cursor = conn.cursor()
    rows = cursor.execute(
        "SELECT * FROM manual_products ORDER BY created_at DESC"
    ).fetchall()
    
    products = []
    for row in rows:
        product = dict(row)
        # Fetch images for this product
        images = cursor.execute(
            "SELECT image_url, media_type FROM product_images WHERE product_id = ? ORDER BY display_order",
            (product["id"],)
        ).fetchall()
        product["images"] = [dict(img) for img in images]
        products.append(product)
    
    conn.close()
    return products


def fetch_manual_product(product_id):
    conn = get_db()
    cursor = conn.cursor()
    row = cursor.execute(
        "SELECT * FROM manual_products WHERE id = ?", (product_id,)
    ).fetchone()
    
    if not row:
        conn.close()
        return None
    
    product = dict(row)
    # Fetch images for this product
    images = cursor.execute(
        "SELECT image_url, media_type FROM product_images WHERE product_id = ? ORDER BY display_order",
        (product_id,)
    ).fetchall()
    product["images"] = [dict(img) for img in images]
    
    conn.close()
    return product


def update_manual_product(product_id, payload):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    
    cursor.execute(
        """
        UPDATE manual_products
        SET name = ?, description = ?, category = ?, materials = ?,
            width = ?, height = ?, depth = ?, price = ?, quantity = ?,
            is_featured = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            payload["name"],
            payload["description"],
            payload.get("category"),
            payload.get("materials"),
            payload.get("width"),
            payload.get("height"),
            payload.get("depth"),
            payload["price"],
            payload["quantity"],
            1 if payload.get("is_featured") else 0,
            now,
            product_id,
        ),
    )
    
    # Update images if provided
    if "images" in payload:
        # Delete old images
        cursor.execute("DELETE FROM product_images WHERE product_id = ?", (product_id,))
        # Insert new images
        for idx, image in enumerate(payload["images"]):
            # Handle both new uploads (with "url" and "type") and existing images (with "image_url" and "media_type")
            image_url = image.get("url") or image.get("image_url")
            media_type = image.get("type") or image.get("media_type", "image")
            
            if image_url:  # Only insert if we have a valid image URL
                cursor.execute(
                    """
                    INSERT INTO product_images (product_id, image_url, media_type, display_order)
                    VALUES (?, ?, ?, ?)
                    """,
                    (product_id, image_url, media_type, idx)
                )
    
    conn.commit()
    conn.close()
    return True


def delete_manual_product(product_id):
    conn = get_db()
    cursor = conn.cursor()
    # Delete images first (cascade should handle this, but being explicit)
    cursor.execute("DELETE FROM product_images WHERE product_id = ?", (product_id,))
    cursor.execute("DELETE FROM manual_products WHERE id = ?", (product_id,))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0
