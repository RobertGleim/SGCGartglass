import os
import sqlite3
from datetime import datetime


def _use_mysql():
    return bool(os.environ.get("DB_HOST"))


def get_db():
    if _use_mysql():
        import pymysql
        conn = pymysql.connect(
            host=os.environ.get("DB_HOST"),
            port=int(os.environ.get("DB_PORT", "3306")),
            user=os.environ.get("DB_USER"),
            password=os.environ.get("DB_PASSWORD"),
            database=os.environ.get("DB_NAME"),
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False,
        )
        return conn
    else:
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
    is_mysql = _use_mysql()
    auto_inc = "AUTO_INCREMENT" if is_mysql else "AUTOINCREMENT"
    
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY {auto_inc},
            etsy_listing_id VARCHAR(255) NOT NULL UNIQUE,
            title TEXT,
            description TEXT,
            price_amount VARCHAR(50),
            price_currency VARCHAR(10),
            image_url TEXT,
            etsy_url TEXT,
            updated_at VARCHAR(50)
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS manual_products (
            id INTEGER PRIMARY KEY {auto_inc},
            name VARCHAR(500) NOT NULL,
            description TEXT NOT NULL,
            category TEXT,
            materials TEXT,
            width REAL,
            height REAL,
            depth REAL,
            price REAL NOT NULL,
            quantity INTEGER NOT NULL,
            is_featured INTEGER DEFAULT 0,
            created_at VARCHAR(50),
            updated_at VARCHAR(50)
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS product_images (
            id INTEGER PRIMARY KEY {auto_inc},
            product_id INTEGER NOT NULL,
            image_url TEXT NOT NULL,
            media_type VARCHAR(50) DEFAULT 'image',
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
    is_mysql = _use_mysql()
    now = datetime.utcnow().isoformat()
    
    if is_mysql:
        # MySQL: use INSERT ... ON DUPLICATE KEY UPDATE
        cursor.execute(
            """
            INSERT INTO items (
                etsy_listing_id, title, description, price_amount,
                price_currency, image_url, etsy_url, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                description = VALUES(description),
                price_amount = VALUES(price_amount),
                price_currency = VALUES(price_currency),
                image_url = VALUES(image_url),
                etsy_url = VALUES(etsy_url),
                updated_at = VALUES(updated_at)
            """,
            (
                payload["etsy_listing_id"],
                payload.get("title"),
                payload.get("description"),
                payload.get("price_amount"),
                payload.get("price_currency"),
                payload.get("image_url"),
                payload.get("etsy_url"),
                now,
            ),
        )
    else:
        # SQLite: use INSERT ... ON CONFLICT ... DO UPDATE
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
                now,
            ),
        )
    
    conn.commit()
    item_id = cursor.lastrowid
    conn.close()
    return item_id


def fetch_items():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM items ORDER BY updated_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def fetch_item(item_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(f"SELECT * FROM items WHERE id = {placeholder}", (item_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def create_manual_product(payload):
    import json
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    
    # Serialize category and materials if they are lists
    category = payload.get("category")
    if isinstance(category, list):
        category = json.dumps(category) if category else None
    
    materials = payload.get("materials")
    if isinstance(materials, list):
        materials = json.dumps(materials) if materials else None
    
    cursor.execute(
        f"""
        INSERT INTO manual_products (
            name, description, category, materials,
            width, height, depth, price, quantity, is_featured,
            created_at, updated_at
        ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, 
                  {placeholder}, {placeholder}, {placeholder}, {placeholder}, 
                  {placeholder}, {placeholder}, {placeholder}, {placeholder})
        """,
        (
            payload["name"],
            payload["description"],
            category,
            materials,
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
            f"""
            INSERT INTO product_images (product_id, image_url, media_type, display_order)
            VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder})
            """,
            (product_id, image["url"], image.get("type", "image"), idx)
        )
    
    conn.commit()
    conn.close()
    return product_id


def fetch_manual_products():
    import json
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    
    cursor.execute("SELECT * FROM manual_products ORDER BY created_at DESC")
    rows = cursor.fetchall()
    
    products = []
    for row in rows:
        product = dict(row)
        
        # Deserialize category and materials from JSON strings
        if product.get("category"):
            try:
                product["category"] = json.loads(product["category"])
            except (json.JSONDecodeError, TypeError):
                pass  # Keep as string if not valid JSON
        
        if product.get("materials"):
            try:
                product["materials"] = json.loads(product["materials"])
            except (json.JSONDecodeError, TypeError):
                pass  # Keep as string if not valid JSON
        
        # Fetch images for this product
        cursor.execute(
            f"SELECT image_url, media_type FROM product_images WHERE product_id = {placeholder} ORDER BY display_order",
            (product["id"],)
        )
        images = cursor.fetchall()
        product["images"] = [dict(img) for img in images]
        products.append(product)
    
    conn.close()
    return products


def fetch_manual_product(product_id):
    import json
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    
    cursor.execute(
        f"SELECT * FROM manual_products WHERE id = {placeholder}", (product_id,)
    )
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return None
    
    product = dict(row)
    
    # Deserialize category and materials from JSON strings
    if product.get("category"):
        try:
            product["category"] = json.loads(product["category"])
        except (json.JSONDecodeError, TypeError):
            pass  # Keep as string if not valid JSON
    
    if product.get("materials"):
        try:
            product["materials"] = json.loads(product["materials"])
        except (json.JSONDecodeError, TypeError):
            pass  # Keep as string if not valid JSON
    
    # Fetch images for this product
    cursor.execute(
        f"SELECT image_url, media_type FROM product_images WHERE product_id = {placeholder} ORDER BY display_order",
        (product_id,)
    )
    images = cursor.fetchall()
    product["images"] = [dict(img) for img in images]
    
    conn.close()
    return product


def update_manual_product(product_id, payload):
    import json
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    
    # Serialize category and materials if they are lists
    category = payload.get("category")
    if isinstance(category, list):
        category = json.dumps(category) if category else None
    
    materials = payload.get("materials")
    if isinstance(materials, list):
        materials = json.dumps(materials) if materials else None
    
    cursor.execute(
        f"""
        UPDATE manual_products
        SET name = {placeholder}, description = {placeholder}, category = {placeholder}, materials = {placeholder},
            width = {placeholder}, height = {placeholder}, depth = {placeholder}, price = {placeholder}, quantity = {placeholder},
            is_featured = {placeholder}, updated_at = {placeholder}
        WHERE id = {placeholder}
        """,
        (
            payload["name"],
            payload["description"],
            category,
            materials,
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
        cursor.execute(f"DELETE FROM product_images WHERE product_id = {placeholder}", (product_id,))
        # Insert new images
        for idx, image in enumerate(payload["images"]):
            # Handle both new uploads (with "url" and "type") and existing images (with "image_url" and "media_type")
            image_url = image.get("url") or image.get("image_url")
            media_type = image.get("type") or image.get("media_type", "image")
            
            if image_url:  # Only insert if we have a valid image URL
                cursor.execute(
                    f"""
                    INSERT INTO product_images (product_id, image_url, media_type, display_order)
                    VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder})
                    """,
                    (product_id, image_url, media_type, idx)
                )
    
    conn.commit()
    conn.close()
    return True


def delete_manual_product(product_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    
    # Delete images first (cascade should handle this, but being explicit)
    cursor.execute(f"DELETE FROM product_images WHERE product_id = {placeholder}", (product_id,))
    cursor.execute(f"DELETE FROM manual_products WHERE id = {placeholder}", (product_id,))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0
