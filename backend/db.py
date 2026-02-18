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
            image_url LONGTEXT,
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
            image_url LONGTEXT NOT NULL,
            media_type VARCHAR(50) DEFAULT 'image',
            display_order INTEGER DEFAULT 0,
            FOREIGN KEY (product_id) REFERENCES manual_products(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY {auto_inc},
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            first_name VARCHAR(120),
            last_name VARCHAR(120),
            phone VARCHAR(50),
            created_at VARCHAR(50),
            updated_at VARCHAR(50),
            last_login_at VARCHAR(50)
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customer_addresses (
            id INTEGER PRIMARY KEY {auto_inc},
            customer_id INTEGER NOT NULL,
            label VARCHAR(120),
            line1 VARCHAR(255) NOT NULL,
            line2 VARCHAR(255),
            city VARCHAR(120),
            state VARCHAR(120),
            postal_code VARCHAR(40),
            country VARCHAR(80),
            is_default INTEGER DEFAULT 0,
            created_at VARCHAR(50),
            updated_at VARCHAR(50),
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customer_favorites (
            id INTEGER PRIMARY KEY {auto_inc},
            customer_id INTEGER NOT NULL,
            product_type VARCHAR(20) NOT NULL,
            product_id VARCHAR(64) NOT NULL,
            created_at VARCHAR(50),
            UNIQUE (customer_id, product_type, product_id),
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customer_cart_items (
            id INTEGER PRIMARY KEY {auto_inc},
            customer_id INTEGER NOT NULL,
            product_type VARCHAR(20) NOT NULL,
            product_id VARCHAR(64) NOT NULL,
            quantity INTEGER DEFAULT 1,
            created_at VARCHAR(50),
            updated_at VARCHAR(50),
            UNIQUE (customer_id, product_type, product_id),
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customer_orders (
            id INTEGER PRIMARY KEY {auto_inc},
            customer_id INTEGER NOT NULL,
            order_number VARCHAR(50),
            status VARCHAR(30) DEFAULT 'pending',
            total_amount REAL,
            currency VARCHAR(10) DEFAULT 'USD',
            created_at VARCHAR(50),
            updated_at VARCHAR(50),
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customer_order_items (
            id INTEGER PRIMARY KEY {auto_inc},
            order_id INTEGER NOT NULL,
            product_type VARCHAR(20) NOT NULL,
            product_id VARCHAR(64) NOT NULL,
            title TEXT,
            price REAL,
            quantity INTEGER DEFAULT 1,
            image_url TEXT,
            FOREIGN KEY (order_id) REFERENCES customer_orders(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customer_reviews (
            id INTEGER PRIMARY KEY {auto_inc},
            customer_id INTEGER NOT NULL,
            product_type VARCHAR(20) NOT NULL,
            product_id VARCHAR(64) NOT NULL,
            rating INTEGER NOT NULL,
            title VARCHAR(200),
            body TEXT,
            verified_purchase INTEGER DEFAULT 0,
            status VARCHAR(20) DEFAULT 'pending',
            created_at VARCHAR(50),
            updated_at VARCHAR(50),
            UNIQUE (customer_id, product_type, product_id),
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
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


def fetch_customer_by_email(email):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(f"SELECT * FROM customers WHERE email = {placeholder}", (email,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def fetch_customer_by_id(customer_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(f"SELECT * FROM customers WHERE id = {placeholder}", (customer_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def create_customer(payload):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"""
        INSERT INTO customers (
            email, password_hash, first_name, last_name, phone,
            created_at, updated_at
        ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder},
                  {placeholder}, {placeholder})
        """,
        (
            payload["email"],
            payload["password_hash"],
            payload.get("first_name"),
            payload.get("last_name"),
            payload.get("phone"),
            now,
            now,
        ),
    )
    customer_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return customer_id


def update_customer_last_login(customer_id):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"""
        UPDATE customers
        SET last_login_at = {placeholder}, updated_at = {placeholder}
        WHERE id = {placeholder}
        """,
        (now, now, customer_id),
    )
    conn.commit()
    conn.close()


def list_customer_addresses(customer_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"SELECT * FROM customer_addresses WHERE customer_id = {placeholder} ORDER BY is_default DESC, created_at DESC",
        (customer_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def create_customer_address(customer_id, payload):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    cursor.execute(
        f"""
        INSERT INTO customer_addresses (
            customer_id, label, line1, line2, city, state, postal_code, country,
            is_default, created_at, updated_at
        ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder},
                  {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
        """,
        (
            customer_id,
            payload.get("label"),
            payload.get("line1"),
            payload.get("line2"),
            payload.get("city"),
            payload.get("state"),
            payload.get("postal_code"),
            payload.get("country"),
            1 if payload.get("is_default") else 0,
            now,
            now,
        ),
    )
    address_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return address_id


def list_customer_favorites(customer_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"SELECT * FROM customer_favorites WHERE customer_id = {placeholder} ORDER BY created_at DESC",
        (customer_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def add_customer_favorite(customer_id, product_type, product_id):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    try:
        cursor.execute(
            f"""
            INSERT INTO customer_favorites (customer_id, product_type, product_id, created_at)
            VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder})
            """,
            (customer_id, product_type, product_id, now),
        )
    except Exception:
        pass
    conn.commit()
    conn.close()


def remove_customer_favorite(customer_id, favorite_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"DELETE FROM customer_favorites WHERE id = {placeholder} AND customer_id = {placeholder}",
        (favorite_id, customer_id),
    )
    conn.commit()
    conn.close()


def list_customer_cart_items(customer_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"SELECT * FROM customer_cart_items WHERE customer_id = {placeholder} ORDER BY updated_at DESC",
        (customer_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def upsert_customer_cart_item(customer_id, product_type, product_id, quantity):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    cursor.execute(
        f"""
        SELECT id, quantity FROM customer_cart_items
        WHERE customer_id = {placeholder} AND product_type = {placeholder} AND product_id = {placeholder}
        """,
        (customer_id, product_type, product_id),
    )
    row = cursor.fetchone()
    if row:
        new_quantity = max(1, int(row["quantity"]) + int(quantity))
        cursor.execute(
            f"""
            UPDATE customer_cart_items
            SET quantity = {placeholder}, updated_at = {placeholder}
            WHERE id = {placeholder}
            """,
            (new_quantity, now, row["id"]),
        )
    else:
        cursor.execute(
            f"""
            INSERT INTO customer_cart_items (customer_id, product_type, product_id, quantity, created_at, updated_at)
            VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            """,
            (customer_id, product_type, product_id, quantity, now, now),
        )
    conn.commit()
    conn.close()


def update_customer_cart_item_quantity(customer_id, item_id, quantity):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"""
        UPDATE customer_cart_items
        SET quantity = {placeholder}, updated_at = {placeholder}
        WHERE id = {placeholder} AND customer_id = {placeholder}
        """,
        (quantity, now, item_id, customer_id),
    )
    conn.commit()
    conn.close()


def remove_customer_cart_item(customer_id, item_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"DELETE FROM customer_cart_items WHERE id = {placeholder} AND customer_id = {placeholder}",
        (item_id, customer_id),
    )
    conn.commit()
    conn.close()


def list_customer_orders(customer_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"SELECT * FROM customer_orders WHERE customer_id = {placeholder} ORDER BY created_at DESC",
        (customer_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def list_customer_order_items(customer_id, order_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"""
        SELECT oi.*
        FROM customer_order_items oi
        JOIN customer_orders o ON o.id = oi.order_id
        WHERE oi.order_id = {placeholder} AND o.customer_id = {placeholder}
        """,
        (order_id, customer_id),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def has_verified_purchase(customer_id, product_type, product_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"""
        SELECT oi.id
        FROM customer_order_items oi
        JOIN customer_orders o ON o.id = oi.order_id
        WHERE o.customer_id = {placeholder}
          AND oi.product_type = {placeholder}
          AND oi.product_id = {placeholder}
        LIMIT 1
        """,
        (customer_id, product_type, product_id),
    )
    row = cursor.fetchone()
    conn.close()
    return bool(row)


def list_reviews_for_product(product_type, product_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"""
        SELECT r.*, c.first_name, c.last_name
        FROM customer_reviews r
        JOIN customers c ON c.id = r.customer_id
        WHERE r.product_type = {placeholder}
          AND r.product_id = {placeholder}
          AND r.status = 'approved'
        ORDER BY r.created_at DESC
        """,
        (product_type, product_id),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def list_customer_reviews(customer_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"SELECT * FROM customer_reviews WHERE customer_id = {placeholder} ORDER BY created_at DESC",
        (customer_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def create_customer_review(customer_id, payload, verified_purchase):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"""
        INSERT INTO customer_reviews (
            customer_id, product_type, product_id, rating, title, body,
            verified_purchase, status, created_at, updated_at
        ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder},
                  {placeholder}, {placeholder}, {placeholder}, {placeholder})
        """,
        (
            customer_id,
            payload["product_type"],
            payload["product_id"],
            payload["rating"],
            payload.get("title"),
            payload.get("body"),
            1 if verified_purchase else 0,
            "approved" if verified_purchase else "pending",
            now,
            now,
        ),
    )
    review_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return review_id
