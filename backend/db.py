import os
import threading
import json
import re
import secrets
import time
from datetime import datetime, timedelta
from urllib.parse import urlparse

try:
    from .models import db as db
except Exception:  # pragma: no cover
    db = None


_schema_initialized = False
_schema_init_lock = threading.Lock()
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))


def _review_image_url_is_available(value):
    raw = str(value or "").strip()
    if not raw:
        return False
    if raw.startswith("data:") or raw.startswith("blob:"):
        return True
    if raw.startswith("http://") or raw.startswith("https://"):
        # External URLs are treated as usable; existence checks would require network I/O.
        return True

    parsed_path = urlparse(raw).path if "://" in raw else raw
    if not parsed_path:
        return False
    if not parsed_path.startswith("/uploads/"):
        return True

    relative_path = parsed_path.lstrip("/").replace("/", os.sep)
    absolute_path = os.path.abspath(os.path.join(_BACKEND_DIR, relative_path))
    uploads_root = os.path.abspath(os.path.join(_BACKEND_DIR, "uploads"))
    if not absolute_path.startswith(uploads_root + os.sep) and absolute_path != uploads_root:
        return False
    return os.path.isfile(absolute_path)


def _normalize_review_image_fields(rows):
    normalized = []
    for row in rows:
        payload = dict(row)
        # Check whether a DB blob exists for this review before removing it.
        has_db_image = bool(payload.get("review_image_data"))
        # Never expose raw review image bytes in JSON API responses.
        payload.pop("review_image_data", None)
        primary_image = payload.get("product_image_url")
        fallback_image = payload.get("fallback_product_image_url")
        direct_image = payload.get("review_image_url")

        def _is_available(url):
            if _review_image_url_is_available(url):
                return True
            # /uploads/reviews/ path missing on disk — still available when DB has a blob.
            raw = str(url or "").strip()
            parsed_path = urlparse(raw).path if "://" in raw else raw
            if parsed_path.startswith("/uploads/reviews/") and has_db_image:
                return True
            return False

        primary_ok = _is_available(primary_image)
        fallback_ok = _is_available(fallback_image)
        direct_ok = _is_available(direct_image)

        if not primary_ok and fallback_ok:
            payload["product_image_url"] = fallback_image
        elif not primary_ok:
            payload["product_image_url"] = None

        if not fallback_ok:
            payload["fallback_product_image_url"] = None

        if not direct_ok:
            payload["review_image_url"] = None

        normalized.append(payload)

    return normalized


def _preferred_database_url():
    app_env = (os.environ.get("APP_ENV") or os.environ.get("FLASK_ENV") or "").strip().lower()
    is_debug = (os.environ.get("FLASK_DEBUG") or "").strip().lower() in {"1", "true", "yes", "on"}
    if app_env in {"development", "testing"} or is_debug:
        return (os.environ.get("POSTGRES_URL") or os.environ.get("DATABASE_URL") or "").strip()
    return (os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or "").strip()


def _db_backend():
    database_url = _preferred_database_url().lower()
    if database_url.startswith(("postgresql://", "postgres://", "postgresql+psycopg://")):
        return "postgres"
    raise RuntimeError("DATABASE_URL (or POSTGRES_URL) must point to PostgreSQL.")


def _use_mysql():
    return True


def _is_mysql_backend():
    return False


def _is_postgres_backend():
    return _db_backend() == "postgres"


def _placeholder():
    return "%s" if _use_mysql() else "?"


def _serialize_related_links(value):
    if not isinstance(value, dict):
        return None

    payload = {}
    allowed = {
        "template_id",
        "template_name",
        "pattern_product_id",
        "pattern_product_name",
        "linked_product_id",
        "linked_product_name",
        "gallery_photo_id",
        "gallery_panel_name",
        "gallery_template_id",
    }
    for key in allowed:
        raw = value.get(key)
        if raw in (None, "", []):
            continue
        payload[key] = raw

    if not payload:
        return None
    return json.dumps(payload)


def _deserialize_related_links(value):
    if not value:
        return None
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _normalize_category_key(value):
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _manual_product_category_list(value):
    if isinstance(value, list):
        return [entry for entry in value if entry not in (None, "")]
    if isinstance(value, str):
        trimmed = value.strip()
        if trimmed.startswith("[") and trimmed.endswith("]"):
            try:
                parsed = json.loads(trimmed)
                if isinstance(parsed, list):
                    return [entry for entry in parsed if entry not in (None, "")]
            except Exception:
                pass
        if "," in trimmed:
            return [entry.strip() for entry in trimmed.split(",") if entry.strip()]
        if trimmed:
            return [trimmed]
    return []


def _manual_product_is_pattern(payload):
    categories = _manual_product_category_list(payload.get("category"))
    return any(_normalize_category_key(entry) in {"pattern", "patterns"} for entry in categories)


def _coerce_manual_product_digital_download(payload):
    raw = payload.get("is_digital_download")
    if raw is None:
        return _manual_product_is_pattern(payload)
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        return raw.strip().lower() in {"1", "true", "yes", "on"}
    return bool(raw)


def _coerce_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _manual_product_image_needs_template_fallback(image_entry):
    if not isinstance(image_entry, dict):
        return True
    if image_entry.get("image_data"):
        return False
    image_url = str(image_entry.get("image_url") or "").strip()
    if not image_url:
        return True
    return False


def _sanitize_catalog_image_url(value):
    image_url = str(value or "").strip()
    if not image_url:
        return ""
    lowered = image_url.lower()
    if lowered.startswith("javascript:"):
        return ""
    # Avoid returning huge inline payloads in list/summary responses.
    if lowered.startswith("data:"):
        return ""
    return image_url


def _fetch_linked_template_preview(cursor, related_links, preview_cache=None):
    if not isinstance(related_links, dict):
        return None

    template_id = related_links.get("template_id")
    if template_id in (None, ""):
        return None

    try:
        normalized_template_id = int(template_id)
    except (TypeError, ValueError):
        normalized_template_id = template_id

    cache_key = str(normalized_template_id)
    if isinstance(preview_cache, dict) and cache_key in preview_cache:
        return preview_cache[cache_key]

    try:
        cursor.execute(
            f"SELECT thumbnail_url, image_url FROM templates WHERE id = {_placeholder()} LIMIT 1",
            (normalized_template_id,),
        )
        row = cursor.fetchone()
    except Exception:
        if isinstance(preview_cache, dict):
            preview_cache[cache_key] = None
        return None

    if not row:
        if isinstance(preview_cache, dict):
            preview_cache[cache_key] = None
        return None

    payload = dict(row)
    preview_url = _sanitize_catalog_image_url(payload.get("thumbnail_url") or payload.get("image_url"))
    if not preview_url:
        if isinstance(preview_cache, dict):
            preview_cache[cache_key] = None
        return None

    preview_payload = {
        "image_url": preview_url,
        "media_type": "image",
    }
    if isinstance(preview_cache, dict):
        preview_cache[cache_key] = preview_payload
    return preview_payload


def _apply_linked_template_preview(product, cursor, preview_cache=None):
    if not isinstance(product, dict) or not _manual_product_is_pattern(product):
        return product

    related_links = _deserialize_related_links(product.get("related_links"))
    if related_links:
        product["related_links"] = related_links

    images = product.get("images") if isinstance(product.get("images"), list) else []
    needs_fallback = not images or _manual_product_image_needs_template_fallback(images[0])
    if not needs_fallback:
        return product

    template_preview = _fetch_linked_template_preview(cursor, related_links, preview_cache=preview_cache)
    if not template_preview:
        return product

    remaining_images = images[1:] if images else []
    product["images"] = [template_preview, *remaining_images]
    return product


def list_all_customers():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM customers ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_db():
    if _is_postgres_backend():
        import psycopg
        from psycopg.rows import dict_row

        raw_url = _preferred_database_url()
        if not raw_url:
            raise RuntimeError("DATABASE_URL or POSTGRES_URL is required for PostgreSQL connections.")

        conninfo = raw_url.replace("postgresql+psycopg://", "postgresql://", 1)
        if conninfo.startswith("postgres://"):
            conninfo = conninfo.replace("postgres://", "postgresql://", 1)

        last_error = None
        for attempt in range(3):
            try:
                conn = psycopg.connect(conninfo, row_factory=dict_row, connect_timeout=5)
                conn.autocommit = False
                return conn
            except psycopg.OperationalError as exc:
                last_error = exc
                if attempt < 2:
                    time.sleep(0.6 * (attempt + 1))
                    continue
                raise

        if last_error is not None:
            raise last_error
    raise RuntimeError("DATABASE_URL (or POSTGRES_URL) must point to PostgreSQL.")


def _add_column_if_missing(cursor, is_postgres, is_mysql, table, column, col_type):
    """Add a column to a table if it doesn't already exist, handling all three DB backends."""
    try:
        if is_postgres:
            cursor.execute(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}"
            )
        elif is_mysql:
            # MySQL doesn't support IF NOT EXISTS for ADD COLUMN; check information_schema
            cursor.execute(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_schema = DATABASE() AND table_name = %s AND column_name = %s",
                (table, column)
            )
            row = cursor.fetchone()
            count = list(row)[0] if row else 0
            if count == 0:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
        else:
            # SQLite: check pragma
            cursor.execute(f"PRAGMA table_info({table})")
            cols = [r[1] for r in cursor.fetchall()]
            if column not in cols:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
    except Exception:
        pass  # Column already exists or DB doesn't support it — safe to ignore


def init_db(force=False):
    global _schema_initialized
    if _schema_initialized and not force:
        return

    with _schema_init_lock:
        if _schema_initialized and not force:
            return

    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _is_mysql_backend()
    is_postgres = _is_postgres_backend()
    id_column = (
        "INTEGER PRIMARY KEY AUTO_INCREMENT"
        if is_mysql
        else "INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY"
        if is_postgres
        else "INTEGER PRIMARY KEY AUTOINCREMENT"
    )
    text_type = "LONGTEXT" if is_mysql else "TEXT"
    
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS items (
            id {id_column},
            etsy_listing_id VARCHAR(255) NOT NULL UNIQUE,
            title TEXT,
            description TEXT,
            price_amount VARCHAR(50),
            price_currency VARCHAR(10),
            image_url {text_type},
            etsy_url TEXT,
            updated_at VARCHAR(50)
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS manual_products (
            id {id_column},
            name VARCHAR(500) NOT NULL,
            description TEXT NOT NULL,
            category TEXT,
            materials TEXT,
            width REAL,
            height REAL,
            depth REAL,
            price REAL NOT NULL,
            old_price REAL,
            discount_percent REAL,
            quantity INTEGER NOT NULL,
            is_featured INTEGER DEFAULT 0,
            is_home_featured INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            is_digital_download INTEGER DEFAULT 0,
            related_links TEXT,
            created_at VARCHAR(50),
            updated_at VARCHAR(50)
        )
        """
    )
    _add_column_if_missing(cursor, is_postgres, is_mysql, "manual_products", "is_home_featured", "INTEGER DEFAULT 0")
    blob_type = "BYTEA" if is_postgres else "LONGBLOB" if is_mysql else "BLOB"
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS product_images (
            id {id_column},
            product_id INTEGER NOT NULL,
            image_url {text_type} NOT NULL,
            image_data {blob_type},
            media_type VARCHAR(50) DEFAULT 'image',
            display_order INTEGER DEFAULT 0,
            created_at VARCHAR(50),
            FOREIGN KEY (product_id) REFERENCES manual_products(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customers (
            id {id_column},
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            first_name VARCHAR(120),
            last_name VARCHAR(120),
            phone VARCHAR(50),
            admin_notes TEXT,
            created_at VARCHAR(50),
            updated_at VARCHAR(50),
            last_login_at VARCHAR(50)
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customer_addresses (
            id {id_column},
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
        CREATE TABLE IF NOT EXISTS customer_password_resets (
            id {id_column},
            customer_id INTEGER NOT NULL,
            token_hash VARCHAR(128) NOT NULL UNIQUE,
            expires_at VARCHAR(50) NOT NULL,
            used_at VARCHAR(50),
            request_ip VARCHAR(100),
            user_agent VARCHAR(255),
            created_at VARCHAR(50) NOT NULL,
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS auth_login_failures (
            id {id_column},
            scope VARCHAR(30) NOT NULL,
            identifier_type VARCHAR(20) NOT NULL,
            identifier VARCHAR(255) NOT NULL,
            failed_count INTEGER DEFAULT 0,
            window_start VARCHAR(50) NOT NULL,
            lock_until VARCHAR(50),
            last_failed_at VARCHAR(50),
            created_at VARCHAR(50) NOT NULL,
            updated_at VARCHAR(50) NOT NULL,
            UNIQUE (scope, identifier_type, identifier)
        )
        """
    )
    try:
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS homepage_visits (
                id {id_column},
                ip_hash VARCHAR(128) NOT NULL,
                visited_on VARCHAR(10) NOT NULL,
                visited_month VARCHAR(7) NOT NULL,
                page_path VARCHAR(120) DEFAULT '/',
                user_agent VARCHAR(255),
                created_at VARCHAR(50) NOT NULL
            )
            """
        )
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS discount_codes (
                id {id_column},
                code VARCHAR(80) NOT NULL UNIQUE,
                name VARCHAR(120),
                discount_percent REAL NOT NULL,
                limit_type VARCHAR(20) DEFAULT 'uses',
                max_uses INTEGER,
                used_count INTEGER DEFAULT 0,
                expires_at VARCHAR(50),
                is_active INTEGER DEFAULT 1,
                created_by VARCHAR(255),
                created_at VARCHAR(50) NOT NULL,
                updated_at VARCHAR(50) NOT NULL
            )
            """
        )
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS discount_redemptions (
                id {id_column},
                discount_code_id INTEGER,
                discount_code VARCHAR(80),
                discount_source VARCHAR(40) NOT NULL,
                customer_email VARCHAR(255),
                session_id VARCHAR(255),
                order_id INTEGER,
                discount_percent REAL,
                discount_amount REAL,
                created_at VARCHAR(50) NOT NULL,
                FOREIGN KEY (discount_code_id) REFERENCES discount_codes(id) ON DELETE SET NULL,
                FOREIGN KEY (order_id) REFERENCES customer_orders(id) ON DELETE SET NULL
            )
            """
        )
    except Exception as exc:
        # In rare concurrent init paths, Postgres can race while creating the
        # identity sequence/type despite IF NOT EXISTS. If the table now exists,
        # continue safely.
        message = str(exc).lower()
        if "homepage_visits" not in message:
            raise
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customer_favorites (
            id {id_column},
            customer_id INTEGER NOT NULL,
            product_type VARCHAR(20) NOT NULL,
            product_id VARCHAR(64) NOT NULL,
            created_at VARCHAR(50),
            UNIQUE (customer_id, product_type, product_id),
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        )
        """
    )

    if is_postgres:
        cursor.execute("ALTER TABLE customers ADD COLUMN IF NOT EXISTS admin_notes TEXT")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_password_resets_customer ON customer_password_resets(customer_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_password_resets_expires ON customer_password_resets(expires_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_password_resets_customer_created ON customer_password_resets(customer_id, created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_auth_login_failures_scope_identifier ON auth_login_failures(scope, identifier_type, identifier)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_auth_login_failures_lock_until ON auth_login_failures(lock_until)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_homepage_visits_day_hash ON homepage_visits(visited_on, ip_hash)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_homepage_visits_month_hash ON homepage_visits(visited_month, ip_hash)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_homepage_visits_created_at ON homepage_visits(created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_discount_codes_active_created ON discount_codes(is_active, created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_discount_redemptions_email_source ON discount_redemptions(customer_email, discount_source)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_discount_redemptions_code ON discount_redemptions(discount_code)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_discount_redemptions_order ON discount_redemptions(order_id)")
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customer_cart_items (
            id {id_column},
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
            id {id_column},
            customer_id INTEGER NOT NULL,
            order_number VARCHAR(50),
            status VARCHAR(30) DEFAULT 'pending',
            subtotal_amount REAL,
            shipping_amount REAL,
            tax_amount REAL,
            total_amount REAL,
            currency VARCHAR(10) DEFAULT 'USD',
            payment_status VARCHAR(30) DEFAULT 'pending',
            payment_provider VARCHAR(30),
            payment_reference VARCHAR(255),
            customer_name VARCHAR(160),
            customer_email VARCHAR(255),
            shipping_address TEXT,
            billing_address TEXT,
            notes TEXT,
            admin_seen INTEGER DEFAULT 0,
            admin_seen_at VARCHAR(50),
            created_at VARCHAR(50),
            updated_at VARCHAR(50),
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customer_order_items (
            id {id_column},
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
        CREATE TABLE IF NOT EXISTS customer_order_events (
            id {id_column},
            order_id INTEGER NOT NULL,
            event_type VARCHAR(80) NOT NULL,
            event_detail TEXT,
            payload TEXT,
            created_at VARCHAR(50),
            FOREIGN KEY (order_id) REFERENCES customer_orders(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customer_checkout_sessions (
            id {id_column},
            session_id VARCHAR(255) NOT NULL UNIQUE,
            customer_id INTEGER NOT NULL,
            customer_email VARCHAR(255),
            status VARCHAR(30) DEFAULT 'pending',
            payload TEXT,
            created_at VARCHAR(50),
            updated_at VARCHAR(50),
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customer_pattern_downloads (
            id {id_column},
            customer_id INTEGER NOT NULL,
            template_id INTEGER,
            manual_product_id INTEGER,
            product_type VARCHAR(20) DEFAULT 'template',
            order_id INTEGER,
            customer_email VARCHAR(255),
            download_token VARCHAR(128) NOT NULL UNIQUE,
            unlocked_at VARCHAR(50),
            last_emailed_at VARCHAR(50),
            created_at VARCHAR(50),
            updated_at VARCHAR(50),
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
            FOREIGN KEY (order_id) REFERENCES customer_orders(id) ON DELETE SET NULL
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customer_invoices (
            id {id_column},
            work_order_id INTEGER,
            customer_id INTEGER NOT NULL,
            invoice_number VARCHAR(50),
            status VARCHAR(30) DEFAULT 'open',
            amount REAL,
            due_date VARCHAR(50),
            notes TEXT,
            created_at VARCHAR(50),
            updated_at VARCHAR(50),
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
            FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS custom_work_order_sequences (
            year INTEGER PRIMARY KEY,
            next_value INTEGER NOT NULL
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS customer_reviews (
            id {id_column},
            customer_id INTEGER NOT NULL,
            product_type VARCHAR(20) NOT NULL,
            product_id VARCHAR(64) NOT NULL,
            rating INTEGER NOT NULL,
            title VARCHAR(200),
            body TEXT,
            review_image_url VARCHAR(512),
            review_image_data BYTEA,
            review_image_mime VARCHAR(100),
            admin_comment TEXT,
            verified_purchase INTEGER DEFAULT 0,
            status VARCHAR(20) DEFAULT 'pending',
            created_at VARCHAR(50),
            updated_at VARCHAR(50),
            UNIQUE (customer_id, product_type, product_id),
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS review_invite_codes (
            id {id_column},
            code_hash VARCHAR(128) NOT NULL UNIQUE,
            product_type VARCHAR(20) NOT NULL,
            product_id VARCHAR(64) NOT NULL,
            product_name VARCHAR(255),
            note TEXT,
            max_uses INTEGER DEFAULT 1,
            used_count INTEGER DEFAULT 0,
            expires_at VARCHAR(50),
            is_active INTEGER DEFAULT 1,
            created_by VARCHAR(255),
            created_at VARCHAR(50),
            updated_at VARCHAR(50)
        )
        """
    )
    conn.commit()

    if is_postgres:
        cursor.execute("ALTER TABLE manual_products ADD COLUMN IF NOT EXISTS related_links TEXT")
        cursor.execute("ALTER TABLE manual_products ADD COLUMN IF NOT EXISTS old_price REAL")
        cursor.execute("ALTER TABLE manual_products ADD COLUMN IF NOT EXISTS discount_percent REAL")
        cursor.execute("ALTER TABLE manual_products ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1")
        cursor.execute("ALTER TABLE manual_products ADD COLUMN IF NOT EXISTS is_digital_download INTEGER DEFAULT 0")
        cursor.execute("ALTER TABLE manual_products ADD COLUMN IF NOT EXISTS is_home_featured INTEGER DEFAULT 0")
        cursor.execute(
            """
            UPDATE manual_products
            SET is_active = 1
            WHERE is_active IS NULL
            """
        )
        cursor.execute(
            """
            UPDATE manual_products
            SET is_digital_download = 1
                        WHERE is_digital_download IS NULL
              AND (
                LOWER(COALESCE(category, '')) LIKE '%pattern%'
                OR LOWER(COALESCE(name, '')) LIKE '%pattern%'
                OR LOWER(COALESCE(description, '')) LIKE '%pattern%'
                OR LOWER(COALESCE(description, '')) LIKE '%svg%'
                OR LOWER(COALESCE(description, '')) LIKE '%line art%'
                OR LOWER(COALESCE(description, '')) LIKE '%trace%'
              )
            """
        )
        cursor.execute("ALTER TABLE customer_reviews ADD COLUMN IF NOT EXISTS review_image_url VARCHAR(512)")
        cursor.execute("ALTER TABLE customer_reviews ADD COLUMN IF NOT EXISTS review_image_data BYTEA")
        cursor.execute("ALTER TABLE customer_reviews ADD COLUMN IF NOT EXISTS review_image_mime VARCHAR(100)")
        cursor.execute("ALTER TABLE customer_reviews ADD COLUMN IF NOT EXISTS admin_comment TEXT")
        cursor.execute("ALTER TABLE review_invite_codes ADD COLUMN IF NOT EXISTS product_name VARCHAR(255)")
        cursor.execute("ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS subtotal_amount REAL")
        cursor.execute("ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS shipping_amount REAL")
        cursor.execute("ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS tax_amount REAL")
        cursor.execute("ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'pending'")
        cursor.execute("ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(30)")
        cursor.execute("ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(255)")
        cursor.execute("ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(160)")
        cursor.execute("ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255)")
        cursor.execute("ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS shipping_address TEXT")
        cursor.execute("ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS billing_address TEXT")
        cursor.execute("ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS notes TEXT")
        cursor.execute("ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS admin_seen INTEGER DEFAULT 0")
        cursor.execute("ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS admin_seen_at VARCHAR(50)")
        cursor.execute("UPDATE customer_orders SET admin_seen = 0 WHERE admin_seen IS NULL")
        cursor.execute("ALTER TABLE customer_checkout_sessions ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255)")
        cursor.execute("ALTER TABLE customer_checkout_sessions ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'pending'")
        cursor.execute("ALTER TABLE customer_checkout_sessions ADD COLUMN IF NOT EXISTS payload TEXT")
        cursor.execute("ALTER TABLE customer_pattern_downloads ADD COLUMN IF NOT EXISTS order_id INTEGER")
        cursor.execute("ALTER TABLE customer_pattern_downloads ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255)")
        cursor.execute("ALTER TABLE customer_pattern_downloads ADD COLUMN IF NOT EXISTS manual_product_id INTEGER")
        cursor.execute("ALTER TABLE customer_pattern_downloads ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) DEFAULT 'template'")
        cursor.execute("ALTER TABLE customer_pattern_downloads ADD COLUMN IF NOT EXISTS download_token VARCHAR(128)")
        cursor.execute("ALTER TABLE customer_pattern_downloads ADD COLUMN IF NOT EXISTS unlocked_at VARCHAR(50)")
        cursor.execute("ALTER TABLE customer_pattern_downloads ADD COLUMN IF NOT EXISTS last_emailed_at VARCHAR(50)")
        cursor.execute("ALTER TABLE customer_pattern_downloads ADD COLUMN IF NOT EXISTS created_at VARCHAR(50)")
        cursor.execute("ALTER TABLE customer_pattern_downloads ADD COLUMN IF NOT EXISTS updated_at VARCHAR(50)")
        # Legacy Postgres schema can still have NOT NULL on template_id/manual_product_id.
        # Manual digital unlock rows must allow template_id=NULL.
        cursor.execute("ALTER TABLE customer_pattern_downloads ALTER COLUMN template_id DROP NOT NULL")
        cursor.execute("ALTER TABLE customer_pattern_downloads ALTER COLUMN manual_product_id DROP NOT NULL")
        cursor.execute("UPDATE customer_pattern_downloads SET product_type = 'template' WHERE product_type IS NULL OR product_type = ''")

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_default_created ON customer_addresses(customer_id, is_default DESC, created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_favorites_customer_created ON customer_favorites(customer_id, created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_cart_items_customer_updated ON customer_cart_items(customer_id, updated_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_orders_customer_created ON customer_orders(customer_id, created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_orders_payment_reference ON customer_orders(payment_reference)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_orders_admin_seen_created ON customer_orders(admin_seen, created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_orders_unseen_created ON customer_orders(created_at DESC) WHERE admin_seen = 0")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_order_items_order ON customer_order_items(order_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_order_items_product_order ON customer_order_items(product_type, product_id, order_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_order_events_order ON customer_order_events(order_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_order_events_created ON customer_order_events(created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_order_events_order_created ON customer_order_events(order_id, created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_checkout_sessions_customer_created ON customer_checkout_sessions(customer_id, created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_checkout_sessions_status_created ON customer_checkout_sessions(status, created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_pattern_downloads_customer_created ON customer_pattern_downloads(customer_id, created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_pattern_downloads_order ON customer_pattern_downloads(order_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_pattern_downloads_template ON customer_pattern_downloads(template_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_pattern_downloads_manual_product ON customer_pattern_downloads(manual_product_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_pattern_downloads_product_lookup ON customer_pattern_downloads(customer_id, product_type, template_id, manual_product_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_reviews_product_status_created ON customer_reviews(product_type, product_id, status, created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_customer_reviews_customer_created ON customer_reviews(customer_id, created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_review_invite_codes_active_expires ON review_invite_codes(is_active, expires_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_review_invite_codes_product ON review_invite_codes(product_type, product_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_manual_products_created_at ON manual_products(created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_product_images_product_order ON product_images(product_id, display_order)")
        _add_column_if_missing(cursor, is_postgres, is_mysql, "product_images", "image_data", "BYTEA" if is_postgres else "LONGBLOB" if is_mysql else "BLOB")
        _add_column_if_missing(cursor, is_postgres, is_mysql, "product_images", "created_at", "VARCHAR(50)")

    conn.commit()
    conn.close()
    _schema_initialized = True


def upsert_item(payload):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _is_mysql_backend()
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
        # PostgreSQL/SQLite: use INSERT ... ON CONFLICT ... DO UPDATE
        placeholder = _placeholder()
        cursor.execute(
            f"""
            INSERT INTO items (
                etsy_listing_id,
                title,
                description,
                price_amount,
                price_currency,
                image_url,
                etsy_url,
                updated_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
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
    placeholder = _placeholder()
    cursor.execute(
        f"SELECT id FROM items WHERE etsy_listing_id = {placeholder}",
        (payload["etsy_listing_id"],),
    )
    row = cursor.fetchone()
    item_id = row["id"] if row else getattr(cursor, "lastrowid", None)
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
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_postgres = _is_postgres_backend()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    
    # Serialize category and materials if they are lists
    category = payload.get("category")
    if isinstance(category, list):
        category = json.dumps(category) if category else None
    
    materials = payload.get("materials")
    if isinstance(materials, list):
        materials = json.dumps(materials) if materials else None
    
    insert_values = (
        payload["name"],
        payload["description"],
        category,
        materials,
        payload.get("width"),
        payload.get("height"),
        payload.get("depth"),
        payload["price"],
        payload.get("old_price"),
        payload.get("discount_percent"),
        payload["quantity"],
        1 if payload.get("is_featured") else 0,
        1 if payload.get("is_home_featured") else 0,
        1 if payload.get("is_active", True) else 0,
        1 if _coerce_manual_product_digital_download(payload) else 0,
        _serialize_related_links(payload.get("related_links")),
        now,
        now,
    )
    if is_postgres:
        cursor.execute(
            f"""
            INSERT INTO manual_products (
                name, description, category, materials,
                width, height, depth, price, old_price, discount_percent, quantity, is_featured,
                is_home_featured,
                is_active,
                is_digital_download,
                related_links,
                created_at, updated_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder},
                      {placeholder}, {placeholder}, {placeholder}, {placeholder},
                      {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            RETURNING id
            """,
            insert_values,
        )
        product_id = cursor.fetchone()["id"]
    else:
        cursor.execute(
            f"""
            INSERT INTO manual_products (
                name, description, category, materials,
                width, height, depth, price, old_price, discount_percent, quantity, is_featured,
                is_home_featured,
                is_active,
                is_digital_download,
                related_links,
                created_at, updated_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder},
                      {placeholder}, {placeholder}, {placeholder}, {placeholder},
                      {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            """,
            insert_values,
        )
        product_id = cursor.lastrowid
    
    # Insert images if provided
    images = payload.get("images", [])
    for idx, image in enumerate(images):
        image_url = image.get("url") or image.get("image_url")
        media_type = image.get("type") or image.get("media_type", "image")
        image_data_hex = image.get("image_data")
        if image_url:
            # Convert hex string back to binary if present
            image_data_binary = None
            if image_data_hex:
                try:
                    image_data_binary = bytes.fromhex(image_data_hex) if isinstance(image_data_hex, str) else image_data_hex
                except (ValueError, TypeError):
                    pass  # If hex conversion fails, just use None
            
            cursor.execute(
                f"""
                INSERT INTO product_images (product_id, image_url, image_data, media_type, display_order, created_at)
                VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
                """,
                (product_id, image_url, image_data_binary, media_type, idx, now)
            )
    
    conn.commit()
    conn.close()
    return product_id


def fetch_manual_products():
    conn = get_db()
    cursor = conn.cursor()
    
    # Query without image_data by default (fallback-safe approach)
    # image_data will be fetched separately if needed
    cursor.execute(
        """
        SELECT
            p.*,
            i.image_url AS product_image_url,
            i.media_type AS product_image_media_type
        FROM manual_products p
        LEFT JOIN product_images i ON i.product_id = p.id
        ORDER BY p.created_at DESC, i.display_order ASC
        """
    )
    rows = cursor.fetchall()

    products = []
    by_id = {}
    for row in rows:
        payload = dict(row)
        product_id = payload.get("id")

        product = by_id.get(product_id)
        if not product:
            payload.pop("product_image_url", None)
            payload.pop("product_image_media_type", None)
            product = payload

            if product.get("category"):
                try:
                    product["category"] = json.loads(product["category"])
                except (json.JSONDecodeError, TypeError):
                    pass

            if product.get("materials"):
                try:
                    product["materials"] = json.loads(product["materials"])
                except (json.JSONDecodeError, TypeError):
                    pass

            product["images"] = []
            product["is_active"] = _coerce_bool(product.get("is_active", 1))
            product["is_home_featured"] = _coerce_bool(product.get("is_home_featured", 0))
            product["is_digital_download"] = _coerce_bool(product.get("is_digital_download"))
            product["related_links"] = _deserialize_related_links(product.get("related_links"))
            by_id[product_id] = product
            products.append(product)

        image_url = payload.get("product_image_url")
        if image_url:
            img_dict = {
                "image_url": image_url,
                "media_type": payload.get("product_image_media_type") or "image",
            }
            product["images"].append(img_dict)
    
    # Try to fetch image_data separately if the column exists (production optimization)
    try:
        is_mysql = _use_mysql()
        placeholder = "%s" if is_mysql else "?"
        for product_id_val, product in by_id.items():
            cursor.execute(
                f"SELECT image_url, image_data, media_type FROM product_images WHERE product_id = {placeholder} ORDER BY display_order",
                (product_id_val,)
            )
            image_rows = cursor.fetchall()
            if image_rows:
                product["images"] = []
                for img_row in image_rows:
                    img_row_dict = dict(img_row)
                    img_data = img_row_dict.get("image_data")
                    img_dict = {
                        "image_url": img_row_dict.get("image_url", ""),
                        "media_type": img_row_dict.get("media_type") or "image",
                    }
                    if img_data:
                        try:
                            if isinstance(img_data, bytes):
                                img_dict["image_data"] = img_data.hex()
                            elif isinstance(img_data, str):
                                img_dict["image_data"] = img_data
                        except (AttributeError, ValueError, TypeError):
                            pass
                    product["images"].append(img_dict)
    except Exception:
        # image_data column doesn't exist, that's fine - use the URLs from above
        pass
    
    conn.close()
    return products


def fetch_manual_products_catalog():
    conn = get_db()
    cursor = conn.cursor()
    template_preview_cache = {}

    # Try with image_data subquery, fall back without if column doesn't exist
    try:
        cursor.execute(
        """
        SELECT
            p.id,
            p.name,
            p.description,
            p.category,
            p.materials,
            p.width,
            p.height,
            p.depth,
            p.price,
            p.old_price,
            p.discount_percent,
            p.quantity,
            p.is_featured,
            p.is_home_featured,
            p.is_active,
            p.is_digital_download,
            p.related_links,
            p.created_at,
            p.updated_at,
            (
                SELECT pi.image_url
                FROM product_images pi
                WHERE pi.product_id = p.id
                ORDER BY pi.display_order
                LIMIT 1
            ) AS preview_image_url,
            (
                SELECT pi.image_data
                FROM product_images pi
                WHERE pi.product_id = p.id
                ORDER BY pi.display_order
                LIMIT 1
            ) AS preview_image_data,
            (
                SELECT pi.media_type
                FROM product_images pi
                WHERE pi.product_id = p.id
                ORDER BY pi.display_order
                LIMIT 1
            ) AS preview_media_type
        FROM manual_products p
        ORDER BY p.created_at DESC
            """
        )
    except Exception:
        # image_data column doesn't exist; query without it
        cursor.execute(
            """
            SELECT
                p.id,
                p.name,
                p.description,
                p.category,
                p.materials,
                p.width,
                p.height,
                p.depth,
                p.price,
                p.old_price,
                p.discount_percent,
                p.quantity,
                p.is_featured,
                p.is_home_featured,
                p.is_active,
                p.is_digital_download,
                p.related_links,
                p.created_at,
                p.updated_at,
                (
                    SELECT pi.image_url
                    FROM product_images pi
                    WHERE pi.product_id = p.id
                    ORDER BY pi.display_order
                    LIMIT 1
                ) AS preview_image_url,
                (
                    SELECT pi.media_type
                    FROM product_images pi
                    WHERE pi.product_id = p.id
                    ORDER BY pi.display_order
                    LIMIT 1
                ) AS preview_media_type
            FROM manual_products p
            ORDER BY p.created_at DESC
            """
        )
    rows = cursor.fetchall()

    products = []
    for row in rows:
        product = dict(row)

        if product.get("category"):
            try:
                product["category"] = json.loads(product["category"])
            except (json.JSONDecodeError, TypeError):
                pass

        if product.get("materials"):
            try:
                product["materials"] = json.loads(product["materials"])
            except (json.JSONDecodeError, TypeError):
                pass

        preview_image_url = _sanitize_catalog_image_url(product.pop("preview_image_url", None))
        # Never expose raw preview binary data in JSON responses.
        product.pop("preview_image_data", None)
        preview_media_type = product.pop("preview_media_type", None)
        
        if preview_image_url:
            product["images"] = [{
                "image_url": preview_image_url,
                "media_type": preview_media_type or "image",
            }]
        else:
            product["images"] = []
            
        product["is_active"] = _coerce_bool(product.get("is_active", 1))
        product["is_home_featured"] = _coerce_bool(product.get("is_home_featured", 0))
        product["is_digital_download"] = _coerce_bool(product.get("is_digital_download"))
        product["related_links"] = _deserialize_related_links(product.get("related_links"))
        product = _apply_linked_template_preview(product, cursor, preview_cache=template_preview_cache)
        products.append(product)

    conn.close()
    return products


def fetch_manual_product(product_id):
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
    
    # Fetch images — include image_data only for rows where image_url is empty (legacy binary-only records).
    # This keeps responses small for the common case while preserving backward compatibility.
    try:
        cursor.execute(
            f"SELECT image_url, image_data, media_type FROM product_images WHERE product_id = {placeholder} ORDER BY display_order",
            (product_id,)
        )
        images = cursor.fetchall()
        product["images"] = []
        for img in images:
            img_dict = dict(img)
            image_url = str(img_dict.get("image_url") or "").strip()
            image_data_raw = img_dict.get("image_data")
            # Only include image_data when image_url is missing — avoids sending large blobs unnecessarily.
            if image_url:
                img_dict.pop("image_data", None)
            elif image_data_raw:
                try:
                    if isinstance(image_data_raw, bytes):
                        img_dict["image_data"] = image_data_raw.hex()
                    elif not isinstance(image_data_raw, str):
                        img_dict.pop("image_data", None)
                except (AttributeError, ValueError, TypeError):
                    img_dict.pop("image_data", None)
            else:
                img_dict.pop("image_data", None)
            product["images"].append(img_dict)
    except Exception:
        # image_data column may not exist in all environments; fall back to URL-only
        try:
            cursor.execute(
                f"SELECT image_url, media_type FROM product_images WHERE product_id = {placeholder} ORDER BY display_order",
                (product_id,)
            )
            images = cursor.fetchall()
            product["images"] = [dict(img) for img in images]
        except Exception:
            product["images"] = []
    product["is_active"] = _coerce_bool(product.get("is_active", 1))
    product["is_home_featured"] = _coerce_bool(product.get("is_home_featured", 0))
    product["is_digital_download"] = _coerce_bool(product.get("is_digital_download"))
    product["related_links"] = _deserialize_related_links(product.get("related_links"))
    product = _apply_linked_template_preview(product, cursor)
    
    conn.close()
    return product


def update_manual_product(product_id, payload):
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
            width = {placeholder}, height = {placeholder}, depth = {placeholder}, price = {placeholder},
            old_price = {placeholder}, discount_percent = {placeholder}, quantity = {placeholder},
            is_featured = {placeholder}, is_home_featured = {placeholder}, is_active = {placeholder}, is_digital_download = {placeholder}, related_links = {placeholder}, updated_at = {placeholder}
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
            payload.get("old_price"),
            payload.get("discount_percent"),
            payload["quantity"],
            1 if payload.get("is_featured") else 0,
            1 if payload.get("is_home_featured") else 0,
            1 if payload.get("is_active", True) else 0,
            1 if _coerce_manual_product_digital_download(payload) else 0,
            _serialize_related_links(payload.get("related_links")),
            now,
            product_id,
        ),
    )
    
    # Update images if provided
    if "images" in payload:
        existing_rows_by_url = {}
        cursor.execute(
            f"SELECT image_url, image_data FROM product_images WHERE product_id = {placeholder} ORDER BY display_order",
            (product_id,),
        )
        for row in cursor.fetchall() or []:
            row_payload = dict(row)
            existing_url = str(row_payload.get("image_url") or "").strip()
            if not existing_url:
                continue
            existing_rows_by_url.setdefault(existing_url, []).append(row_payload.get("image_data"))

        # Delete old images
        cursor.execute(f"DELETE FROM product_images WHERE product_id = {placeholder}", (product_id,))
        # Insert new images
        now = datetime.utcnow().isoformat() if hasattr(datetime, 'utcnow') else None
        for idx, image in enumerate(payload["images"]):
            # Handle both new uploads (with "url" and "type") and existing images (with "image_url" and "media_type")
            image_url = str(image.get("url") or image.get("image_url") or "").strip()
            media_type = image.get("type") or image.get("media_type", "image")
            image_data_hex = image.get("image_data")

            if image_url:  # Only insert if we have a valid image URL
                # Convert hex string back to binary if present
                image_data_binary = None
                if image_data_hex:
                    try:
                        image_data_binary = bytes.fromhex(image_data_hex) if isinstance(image_data_hex, str) else image_data_hex
                    except (ValueError, TypeError):
                        pass  # If hex conversion fails, just use None

                # Preserve existing blob data when the client sends an unchanged URL without image_data.
                if image_data_binary is None:
                    existing_blobs = existing_rows_by_url.get(image_url) or []
                    if existing_blobs:
                        image_data_binary = existing_blobs.pop(0)

                cursor.execute(
                    f"""
                    INSERT INTO product_images (product_id, image_url, image_data, media_type, display_order, created_at)
                    VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
                    """,
                    (product_id, image_url, image_data_binary, media_type, idx, now)
                )
    
    conn.commit()
    conn.close()
    return True


def count_home_featured_manual_products(exclude_product_id=None):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    if exclude_product_id is None:
        cursor.execute("SELECT COUNT(*) AS total FROM manual_products WHERE is_home_featured = 1")
    else:
        cursor.execute(
            f"SELECT COUNT(*) AS total FROM manual_products WHERE is_home_featured = 1 AND id != {placeholder}",
            (exclude_product_id,),
        )

    row = cursor.fetchone()
    conn.close()
    if not row:
        return 0
    row_payload = dict(row)
    return int(row_payload.get("total") or 0)


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
    is_postgres = _is_postgres_backend()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    values = (
        payload["email"],
        payload["password_hash"],
        payload.get("first_name"),
        payload.get("last_name"),
        payload.get("phone"),
        now,
        now,
    )
    if is_postgres:
        cursor.execute(
            f"""
            INSERT INTO customers (
                email, password_hash, first_name, last_name, phone,
                created_at, updated_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder},
                      {placeholder}, {placeholder})
            RETURNING id
            """,
            values,
        )
        customer_id = cursor.fetchone()["id"]
    else:
        cursor.execute(
            f"""
            INSERT INTO customers (
                email, password_hash, first_name, last_name, phone,
                created_at, updated_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder},
                      {placeholder}, {placeholder})
            """,
            values,
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


def update_customer_profile_self(customer_id, payload):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    cursor.execute(
        f"""
        UPDATE customers
        SET first_name = {placeholder},
            last_name = {placeholder},
            phone = {placeholder},
            updated_at = {placeholder}
        WHERE id = {placeholder}
        """,
        (
            payload.get("first_name"),
            payload.get("last_name"),
            payload.get("phone"),
            now,
            customer_id,
        ),
    )

    if cursor.rowcount == 0:
        conn.rollback()
        conn.close()
        return None

    cursor.execute(
        f"SELECT * FROM customers WHERE id = {placeholder}",
        (customer_id,),
    )
    updated = cursor.fetchone()
    conn.commit()
    conn.close()
    return dict(updated) if updated else None


def update_customer_password(customer_id, password_hash):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    cursor.execute(
        f"""
        UPDATE customers
        SET password_hash = {placeholder}, updated_at = {placeholder}
        WHERE id = {placeholder}
        """,
        (password_hash, now, customer_id),
    )
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0


def count_recent_password_reset_requests(customer_id, request_ip, since_iso):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    cursor.execute(
        f"""
        SELECT COUNT(*) AS cnt
        FROM customer_password_resets
        WHERE customer_id = {placeholder}
          AND created_at >= {placeholder}
        """,
        (customer_id, since_iso),
    )
    customer_count = int((cursor.fetchone() or {}).get("cnt") or 0)

    ip_count = 0
    if request_ip:
        cursor.execute(
            f"""
            SELECT COUNT(*) AS cnt
            FROM customer_password_resets
            WHERE request_ip = {placeholder}
              AND created_at >= {placeholder}
            """,
            (request_ip, since_iso),
        )
        ip_count = int((cursor.fetchone() or {}).get("cnt") or 0)

    conn.close()
    return {
        "customer_count": customer_count,
        "ip_count": ip_count,
    }


def create_customer_password_reset(customer_id, token_hash, expires_at, request_ip=None, user_agent=None):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_postgres = _is_postgres_backend()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    values = (
        customer_id,
        token_hash,
        expires_at,
        request_ip,
        user_agent,
        now,
    )

    if is_postgres:
        cursor.execute(
            f"""
            INSERT INTO customer_password_resets (
                customer_id, token_hash, expires_at, request_ip, user_agent, created_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            RETURNING id
            """,
            values,
        )
        reset_id = cursor.fetchone()["id"]
    else:
        cursor.execute(
            f"""
            INSERT INTO customer_password_resets (
                customer_id, token_hash, expires_at, request_ip, user_agent, created_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            """,
            values,
        )
        reset_id = cursor.lastrowid

    conn.commit()
    conn.close()
    return reset_id


def consume_customer_password_reset(token_hash, now_iso):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    cursor.execute(
        f"""
        SELECT id, customer_id
        FROM customer_password_resets
        WHERE token_hash = {placeholder}
          AND used_at IS NULL
          AND expires_at > {placeholder}
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (token_hash, now_iso),
    )
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None

    cursor.execute(
        f"""
        UPDATE customer_password_resets
        SET used_at = {placeholder}
        WHERE id = {placeholder} AND used_at IS NULL
        """,
        (now_iso, row["id"]),
    )

    if cursor.rowcount == 0:
        conn.rollback()
        conn.close()
        return None

    conn.commit()
    conn.close()
    return row["customer_id"]


def revoke_customer_password_resets(customer_id):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"""
        UPDATE customer_password_resets
        SET used_at = {placeholder}
        WHERE customer_id = {placeholder}
          AND used_at IS NULL
        """,
        (now, customer_id),
    )
    conn.commit()
    conn.close()


def _to_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None


def _login_identifiers(email=None, request_ip=None):
    identifiers = []
    normalized_email = str(email or "").strip().lower()
    normalized_ip = str(request_ip or "").strip()
    if normalized_email:
        identifiers.append(("email", normalized_email))
    if normalized_ip:
        identifiers.append(("ip", normalized_ip))
    return identifiers


def _auth_login_retention_days():
    raw = str(os.environ.get("AUTH_LOGIN_RETENTION_DAYS") or "").strip()
    if not raw:
        return 30
    try:
        return max(1, int(raw))
    except ValueError:
        return 30


def _prune_auth_login_failures(cursor, now_dt):
    retention_days = _auth_login_retention_days()
    cutoff_iso = (now_dt - timedelta(days=retention_days)).isoformat()
    now_iso = now_dt.isoformat()
    placeholder = _placeholder()

    cursor.execute(
        f"""
        DELETE FROM auth_login_failures
        WHERE updated_at < {placeholder}
          AND (lock_until IS NULL OR lock_until < {placeholder})
        """,
        (cutoff_iso, now_iso),
    )
    return cursor.rowcount > 0


def get_login_lockout_remaining(scope, email=None, request_ip=None):
    identifiers = _login_identifiers(email=email, request_ip=request_ip)
    if not identifiers:
        return 0

    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    now_dt = datetime.utcnow()
    did_prune = _prune_auth_login_failures(cursor, now_dt)
    if did_prune:
        conn.commit()
    remaining = 0

    for identifier_type, identifier in identifiers:
        cursor.execute(
            f"""
            SELECT lock_until
            FROM auth_login_failures
            WHERE scope = {placeholder}
              AND identifier_type = {placeholder}
              AND identifier = {placeholder}
            LIMIT 1
            """,
            (scope, identifier_type, identifier),
        )
        row = cursor.fetchone() or {}
        lock_until_dt = _to_datetime(row.get("lock_until"))
        if lock_until_dt and lock_until_dt > now_dt:
            remaining = max(remaining, int((lock_until_dt - now_dt).total_seconds()))

    conn.close()
    return remaining


def record_login_failure(scope, email=None, request_ip=None, max_attempts=5, window_seconds=900, lockout_seconds=900):
    identifiers = _login_identifiers(email=email, request_ip=request_ip)
    if not identifiers:
        return 0

    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    now_dt = datetime.utcnow()
    now_iso = now_dt.isoformat()
    _prune_auth_login_failures(cursor, now_dt)
    remaining = 0

    for identifier_type, identifier in identifiers:
        cursor.execute(
            f"""
            SELECT id, failed_count, window_start
            FROM auth_login_failures
            WHERE scope = {placeholder}
              AND identifier_type = {placeholder}
              AND identifier = {placeholder}
            LIMIT 1
            """,
            (scope, identifier_type, identifier),
        )
        row = cursor.fetchone()

        failed_count = 0
        window_start_dt = now_dt
        if row:
            previous_window_start = _to_datetime(row.get("window_start"))
            if previous_window_start and now_dt - previous_window_start <= timedelta(seconds=max(1, int(window_seconds))):
                failed_count = int(row.get("failed_count") or 0)
                window_start_dt = previous_window_start

        failed_count += 1
        lock_until_iso = None
        if failed_count >= max(1, int(max_attempts)):
            lock_until_dt = now_dt + timedelta(seconds=max(1, int(lockout_seconds)))
            lock_until_iso = lock_until_dt.isoformat()
            remaining = max(remaining, int((lock_until_dt - now_dt).total_seconds()))

        if row:
            cursor.execute(
                f"""
                UPDATE auth_login_failures
                SET failed_count = {placeholder},
                    window_start = {placeholder},
                    lock_until = {placeholder},
                    last_failed_at = {placeholder},
                    updated_at = {placeholder}
                WHERE id = {placeholder}
                """,
                (failed_count, window_start_dt.isoformat(), lock_until_iso, now_iso, now_iso, row["id"]),
            )
        else:
            cursor.execute(
                f"""
                INSERT INTO auth_login_failures (
                    scope, identifier_type, identifier, failed_count, window_start, lock_until, last_failed_at, created_at, updated_at
                ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
                """,
                (
                    scope,
                    identifier_type,
                    identifier,
                    failed_count,
                    window_start_dt.isoformat(),
                    lock_until_iso,
                    now_iso,
                    now_iso,
                    now_iso,
                ),
            )

    conn.commit()
    conn.close()
    return remaining


def clear_login_failures(scope, email=None, request_ip=None):
    identifiers = _login_identifiers(email=email, request_ip=request_ip)
    if not identifiers:
        return

    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    now_dt = datetime.utcnow()
    _prune_auth_login_failures(cursor, now_dt)

    for identifier_type, identifier in identifiers:
        cursor.execute(
            f"""
            DELETE FROM auth_login_failures
            WHERE scope = {placeholder}
              AND identifier_type = {placeholder}
              AND identifier = {placeholder}
            """,
            (scope, identifier_type, identifier),
        )

    conn.commit()
    conn.close()


def record_homepage_visit(ip_hash, page_path="/", user_agent=None):
    normalized_hash = str(ip_hash or "").strip()
    if not normalized_hash:
        return False

    normalized_path = str(page_path or "/").strip() or "/"
    now = datetime.utcnow()
    now_iso = now.isoformat()
    visited_on = now.strftime("%Y-%m-%d")
    visited_month = now.strftime("%Y-%m")

    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    cursor.execute(
        f"""
        INSERT INTO homepage_visits (ip_hash, visited_on, visited_month, page_path, user_agent, created_at)
        VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
        """,
        (normalized_hash, visited_on, visited_month, normalized_path, user_agent, now_iso),
    )
    conn.commit()
    conn.close()
    return True


def _count_unique_homepage_ips(cursor, where_sql="", params=()):
    cursor.execute(
        f"SELECT COUNT(DISTINCT ip_hash) AS cnt FROM homepage_visits {where_sql}",
        params,
    )
    row = cursor.fetchone() or {}
    return int(row.get("cnt") or 0)


def _previous_month_label(current_month_label):
    try:
        dt = datetime.strptime(f"{current_month_label}-01", "%Y-%m-%d")
    except Exception:
        return ""
    year = dt.year
    month = dt.month - 1
    if month < 1:
        month = 12
        year -= 1
    return f"{year:04d}-{month:02d}"


def get_homepage_visit_insights():
    now = datetime.utcnow()
    today = now.strftime("%Y-%m-%d")
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    month = now.strftime("%Y-%m")
    previous_month = _previous_month_label(month)

    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()

    total_unique = _count_unique_homepage_ips(cursor)
    today_unique = _count_unique_homepage_ips(
        cursor,
        f"WHERE visited_on = {placeholder}",
        (today,),
    )
    yesterday_unique = _count_unique_homepage_ips(
        cursor,
        f"WHERE visited_on = {placeholder}",
        (yesterday,),
    )
    month_unique = _count_unique_homepage_ips(
        cursor,
        f"WHERE visited_month = {placeholder}",
        (month,),
    )
    previous_month_unique = _count_unique_homepage_ips(
        cursor,
        f"WHERE visited_month = {placeholder}",
        (previous_month,),
    ) if previous_month else 0

    conn.close()

    day_delta = today_unique - yesterday_unique
    month_delta = month_unique - previous_month_unique

    return {
        "total_clicks": total_unique,
        "clicks_today": today_unique,
        "monthly_clicks": month_unique,
        "previous_day_clicks": yesterday_unique,
        "previous_month_clicks": previous_month_unique,
        "daily_delta": day_delta,
        "monthly_delta": month_delta,
        "daily_trend": "up" if day_delta > 0 else "down" if day_delta < 0 else "flat",
        "monthly_trend": "up" if month_delta > 0 else "down" if month_delta < 0 else "flat",
        "today": today,
        "month": month,
        "previous_month": previous_month,
    }


def create_discount_code(payload):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    placeholder = _placeholder()

    code = str(payload.get("code") or "").strip().upper()
    name = str(payload.get("name") or "").strip() or None
    discount_percent = float(payload.get("discount_percent") or 0)
    limit_type = str(payload.get("limit_type") or "uses").strip().lower()
    max_uses = payload.get("max_uses")
    max_uses = int(max_uses) if max_uses not in (None, "") else None
    expires_at = str(payload.get("expires_at") or "").strip() or None
    created_by = str(payload.get("created_by") or "").strip() or None

    cursor.execute(
        f"""
        INSERT INTO discount_codes (
            code, name, discount_percent, limit_type, max_uses, used_count,
            expires_at, is_active, created_by, created_at, updated_at
        ) VALUES (
            {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, 0,
            {placeholder}, 1, {placeholder}, {placeholder}, {placeholder}
        )
        RETURNING *
        """,
        (code, name, discount_percent, limit_type, max_uses, expires_at, created_by, now, now),
    )
    row = cursor.fetchone()
    conn.commit()
    conn.close()
    return dict(row) if row else None


def list_discount_codes(limit=200):
    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    safe_limit = max(1, min(int(limit or 200), 500))
    cursor.execute(
        f"""
        SELECT *
        FROM discount_codes
        ORDER BY created_at DESC
        LIMIT {placeholder}
        """,
        (safe_limit,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_discount_code_by_code(code):
    normalized_code = str(code or "").strip().upper()
    if not normalized_code:
        return None

    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    cursor.execute(
        f"SELECT * FROM discount_codes WHERE code = {placeholder} LIMIT 1",
        (normalized_code,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def discount_email_has_paid_order(customer_email):
    normalized_email = str(customer_email or "").strip().lower()
    if not normalized_email:
        return False

    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    cursor.execute(
        f"""
        SELECT COUNT(*) AS cnt
        FROM customer_orders
        WHERE LOWER(COALESCE(customer_email, '')) = {placeholder}
          AND LOWER(COALESCE(payment_status, '')) = 'paid'
        """,
        (normalized_email,),
    )
    row = cursor.fetchone() or {}
    conn.close()
    return int(row.get("cnt") or 0) > 0


def has_discount_redemption_for_email(customer_email, discount_source):
    normalized_email = str(customer_email or "").strip().lower()
    normalized_source = str(discount_source or "").strip().lower()
    if not normalized_email or not normalized_source:
        return False

    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    cursor.execute(
        f"""
        SELECT COUNT(*) AS cnt
        FROM discount_redemptions
        WHERE LOWER(COALESCE(customer_email, '')) = {placeholder}
          AND LOWER(COALESCE(discount_source, '')) = {placeholder}
        """,
        (normalized_email, normalized_source),
    )
    row = cursor.fetchone() or {}
    conn.close()
    return int(row.get("cnt") or 0) > 0


def record_discount_redemption(payload):
    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    now = datetime.utcnow().isoformat()

    discount_code_id = payload.get("discount_code_id")
    discount_code = str(payload.get("discount_code") or "").strip().upper() or None
    discount_source = str(payload.get("discount_source") or "").strip().lower()
    customer_email = str(payload.get("customer_email") or "").strip().lower() or None
    session_id = str(payload.get("session_id") or "").strip() or None
    order_id = payload.get("order_id")
    discount_percent = payload.get("discount_percent")
    discount_amount = payload.get("discount_amount")

    cursor.execute(
        f"""
        INSERT INTO discount_redemptions (
            discount_code_id, discount_code, discount_source, customer_email,
            session_id, order_id, discount_percent, discount_amount, created_at
        ) VALUES (
            {placeholder}, {placeholder}, {placeholder}, {placeholder},
            {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}
        )
        """,
        (
            discount_code_id,
            discount_code,
            discount_source,
            customer_email,
            session_id,
            order_id,
            discount_percent,
            discount_amount,
            now,
        ),
    )

    if discount_code_id:
        cursor.execute(
            f"""
            UPDATE discount_codes
            SET used_count = used_count + 1,
                updated_at = {placeholder}
            WHERE id = {placeholder}
            """,
            (now, discount_code_id),
        )

    conn.commit()
    conn.close()


def update_customer_admin(customer_id, payload):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    updates = []
    values = []

    for field in ("email", "first_name", "last_name", "phone", "admin_notes"):
        if field in payload:
            updates.append(f"{field} = {placeholder}")
            values.append(payload.get(field))

    updates.append(f"updated_at = {placeholder}")
    values.append(now)
    values.append(customer_id)

    cursor.execute(
        f"""
        UPDATE customers
        SET {', '.join(updates)}
        WHERE id = {placeholder}
        """,
        tuple(values),
    )

    if cursor.rowcount == 0:
        conn.rollback()
        conn.close()
        return None

    cursor.execute(
        f"SELECT * FROM customers WHERE id = {placeholder}",
        (customer_id,),
    )
    updated = cursor.fetchone()
    conn.commit()
    conn.close()
    return dict(updated) if updated else None


def delete_customer_admin(customer_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    cursor.execute(
        f"DELETE FROM customers WHERE id = {placeholder}",
        (customer_id,),
    )
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


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
    is_postgres = _is_postgres_backend()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    values = (
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
    )
    if is_postgres:
        cursor.execute(
            f"""
            INSERT INTO customer_addresses (
                customer_id, label, line1, line2, city, state, postal_code, country,
                is_default, created_at, updated_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder},
                      {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            RETURNING id
            """,
            values,
        )
        address_id = cursor.fetchone()["id"]
    else:
        cursor.execute(
            f"""
            INSERT INTO customer_addresses (
                customer_id, label, line1, line2, city, state, postal_code, country,
                is_default, created_at, updated_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder},
                      {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            """,
            values,
        )
        address_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return address_id


def upsert_customer_primary_address(customer_id, payload):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    cursor.execute(
        f"SELECT id FROM customer_addresses WHERE customer_id = {placeholder} ORDER BY is_default DESC, created_at ASC LIMIT 1",
        (customer_id,),
    )
    existing = cursor.fetchone()

    values = (
        payload.get("label") or "Primary",
        payload.get("line1"),
        payload.get("line2"),
        payload.get("city"),
        payload.get("state"),
        payload.get("postal_code"),
        payload.get("country"),
        now,
    )

    if existing:
        cursor.execute(
            f"""
            UPDATE customer_addresses
            SET label = {placeholder},
                line1 = {placeholder},
                line2 = {placeholder},
                city = {placeholder},
                state = {placeholder},
                postal_code = {placeholder},
                country = {placeholder},
                is_default = 1,
                updated_at = {placeholder}
            WHERE id = {placeholder}
            """,
            values + (existing["id"],),
        )
    else:
        cursor.execute(
            f"""
            INSERT INTO customer_addresses (
                customer_id, label, line1, line2, city, state, postal_code, country,
                is_default, created_at, updated_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder},
                      {placeholder}, {placeholder}, 1, {placeholder}, {placeholder})
            """,
            (
                customer_id,
                payload.get("label") or "Primary",
                payload.get("line1"),
                payload.get("line2"),
                payload.get("city"),
                payload.get("state"),
                payload.get("postal_code"),
                payload.get("country"),
                now,
                now,
            ),
        )

    conn.commit()
    conn.close()


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


def count_customer_favorites_total():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) AS total FROM customer_favorites")
    row = cursor.fetchone()
    conn.close()

    if not row:
        return 0
    if isinstance(row, dict):
        return int(row.get("total") or 0)
    return int(row[0] or 0)


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
        cursor.execute(
            f"""
            UPDATE customer_cart_items
            SET quantity = {placeholder}, updated_at = {placeholder}
            WHERE id = {placeholder}
            """,
            (1, now, row["id"]),
        )
    else:
        cursor.execute(
            f"""
            INSERT INTO customer_cart_items (customer_id, product_type, product_id, quantity, created_at, updated_at)
            VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            """,
            (customer_id, product_type, product_id, 1, now, now),
        )
    conn.commit()
    conn.close()


def update_customer_cart_item_quantity(customer_id, item_id, quantity):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    safe_quantity = 1 if int(quantity or 1) >= 1 else 1
    cursor.execute(
        f"""
        UPDATE customer_cart_items
        SET quantity = {placeholder}, updated_at = {placeholder}
        WHERE id = {placeholder} AND customer_id = {placeholder}
        """,
        (safe_quantity, now, item_id, customer_id),
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


def create_customer_order_with_items(customer_id, order_payload, order_items):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    is_postgres = _is_postgres_backend()
    placeholder = "%s" if is_mysql else "?"
    now = datetime.utcnow().isoformat()

    insert_values = (
        customer_id,
        order_payload.get("order_number"),
        order_payload.get("status", "pending"),
        order_payload.get("subtotal_amount"),
        order_payload.get("shipping_amount"),
        order_payload.get("tax_amount"),
        order_payload.get("total_amount"),
        order_payload.get("currency", "USD"),
        order_payload.get("payment_status", "pending"),
        order_payload.get("payment_provider"),
        order_payload.get("payment_reference"),
        order_payload.get("customer_name"),
        order_payload.get("customer_email"),
        order_payload.get("shipping_address"),
        order_payload.get("billing_address"),
        order_payload.get("notes"),
        0,
        None,
        now,
        now,
    )

    if is_postgres:
        cursor.execute(
            f"""
            INSERT INTO customer_orders (
                customer_id, order_number, status,
                subtotal_amount, shipping_amount, tax_amount, total_amount, currency,
                payment_status, payment_provider, payment_reference,
                customer_name, customer_email,
                shipping_address, billing_address, notes,
                admin_seen, admin_seen_at,
                created_at, updated_at
            ) VALUES (
                {placeholder}, {placeholder}, {placeholder},
                {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder},
                {placeholder}, {placeholder}, {placeholder},
                {placeholder}, {placeholder},
                {placeholder}, {placeholder}, {placeholder},
                {placeholder}, {placeholder},
                {placeholder}, {placeholder}
            )
            RETURNING id
            """,
            insert_values,
        )
        order_id = cursor.fetchone()["id"]
    else:
        cursor.execute(
            f"""
            INSERT INTO customer_orders (
                customer_id, order_number, status,
                subtotal_amount, shipping_amount, tax_amount, total_amount, currency,
                payment_status, payment_provider, payment_reference,
                customer_name, customer_email,
                shipping_address, billing_address, notes,
                admin_seen, admin_seen_at,
                created_at, updated_at
            ) VALUES (
                {placeholder}, {placeholder}, {placeholder},
                {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder},
                {placeholder}, {placeholder}, {placeholder},
                {placeholder}, {placeholder},
                {placeholder}, {placeholder}, {placeholder},
                {placeholder}, {placeholder},
                {placeholder}, {placeholder}
            )
            """,
            insert_values,
        )
        order_id = cursor.lastrowid

    for item in order_items:
        item_product_type = str(item.get("product_type") or "").strip().lower()
        item_product_id = str(item.get("product_id") or "").strip()
        item_quantity = max(1, int(item.get("quantity", 1) or 1))

        cursor.execute(
            f"""
            INSERT INTO customer_order_items (order_id, product_type, product_id, title, price, quantity, image_url)
            VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            """,
            (
                order_id,
                item_product_type,
                item_product_id,
                item.get("title"),
                item.get("price"),
                item_quantity,
                item.get("image_url"),
            ),
        )

        # Physical manual products should decrement inventory on successful purchase.
        if item_product_type == "manual" and item_product_id.isdigit():
            cursor.execute(
                f"""
                SELECT quantity, is_digital_download
                FROM manual_products
                WHERE id = {placeholder}
                LIMIT 1
                """,
                (int(item_product_id),),
            )
            manual_row = cursor.fetchone()
            if manual_row:
                manual_payload = dict(manual_row)
                is_digital_download = _coerce_bool(manual_payload.get("is_digital_download"))
                if not is_digital_download:
                    try:
                        current_quantity = int(manual_payload.get("quantity") or 0)
                    except (TypeError, ValueError):
                        current_quantity = 0
                    next_quantity = max(0, current_quantity - item_quantity)
                    cursor.execute(
                        f"""
                        UPDATE manual_products
                        SET quantity = {placeholder}, updated_at = {placeholder}
                        WHERE id = {placeholder}
                        """,
                        (next_quantity, now, int(item_product_id)),
                    )

    cursor.execute(
        f"""
        INSERT INTO customer_order_events (order_id, event_type, event_detail, payload, created_at)
        VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
        """,
        (
            order_id,
            "order.placed",
            f"Order placed with payment_status={order_payload.get('payment_status', 'pending')}",
            None,
            now,
        ),
    )

    cursor.execute(
        f"DELETE FROM customer_cart_items WHERE customer_id = {placeholder}",
        (customer_id,),
    )

    conn.commit()
    conn.close()
    return order_id


def create_customer_checkout_session_snapshot(session_id, customer_id, payload, customer_email=None, status="pending"):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    now = datetime.utcnow().isoformat()
    payload_text = json.dumps(payload or {})

    cursor.execute(
        f"SELECT id FROM customer_checkout_sessions WHERE session_id = {placeholder} LIMIT 1",
        (session_id,),
    )
    row = cursor.fetchone()
    if row:
        cursor.execute(
            f"""
            UPDATE customer_checkout_sessions
            SET customer_id = {placeholder}, customer_email = {placeholder}, status = {placeholder}, payload = {placeholder}, updated_at = {placeholder}
            WHERE session_id = {placeholder}
            """,
            (customer_id, customer_email, status, payload_text, now, session_id),
        )
    else:
        cursor.execute(
            f"""
            INSERT INTO customer_checkout_sessions (session_id, customer_id, customer_email, status, payload, created_at, updated_at)
            VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            """,
            (session_id, customer_id, customer_email, status, payload_text, now, now),
        )

    conn.commit()
    conn.close()


def get_customer_checkout_session_snapshot(session_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"SELECT * FROM customer_checkout_sessions WHERE session_id = {placeholder} LIMIT 1",
        (session_id,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    payload = dict(row)
    raw_payload = payload.get("payload")
    if raw_payload:
        try:
            payload["payload"] = json.loads(raw_payload)
        except Exception:
            payload["payload"] = None
    return payload


def mark_customer_checkout_session_processed(session_id, status="processed"):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    now = datetime.utcnow().isoformat()
    cursor.execute(
        f"""
        UPDATE customer_checkout_sessions
        SET status = {placeholder}, updated_at = {placeholder}
        WHERE session_id = {placeholder}
        """,
        (status, now, session_id),
    )
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated


def list_admin_digital_checkout_sessions(limit=200):
    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    limit_value = max(1, min(int(limit or 200), 500))
    cursor.execute(
        f"""
        SELECT
            s.*,
            c.first_name,
            c.last_name,
            c.email AS account_email
        FROM customer_checkout_sessions s
        JOIN customers c ON c.id = s.customer_id
        ORDER BY s.updated_at DESC, s.created_at DESC
        LIMIT {placeholder}
        """,
        (limit_value,),
    )
    rows = cursor.fetchall()
    conn.close()

    sessions = []
    for row in rows:
        payload = dict(row)
        raw_payload = payload.get("payload")
        payload_data = None
        if isinstance(raw_payload, str) and raw_payload.strip():
            try:
                payload_data = json.loads(raw_payload)
            except Exception:
                payload_data = None
        elif isinstance(raw_payload, dict):
            payload_data = raw_payload

        items = payload_data.get("items") if isinstance(payload_data, dict) else []
        if not isinstance(items, list):
            items = []

        digital_items = []
        for item in items:
            if not isinstance(item, dict):
                continue
            is_digital = _coerce_bool(item.get("is_digital"))
            if not is_digital:
                continue
            digital_items.append({
                "title": str(item.get("title") or "Digital item").strip(),
                "product_type": str(item.get("product_type") or "").strip().lower(),
                "product_id": str(item.get("product_id") or "").strip(),
            })

        if not digital_items:
            continue

        first_name = str(payload.get("first_name") or "").strip()
        last_name = str(payload.get("last_name") or "").strip()
        customer_name = " ".join([part for part in [first_name, last_name] if part]).strip()
        customer_email = str(payload.get("customer_email") or "").strip() or str(payload.get("account_email") or "").strip()

        sessions.append({
            "session_id": payload.get("session_id"),
            "customer_id": payload.get("customer_id"),
            "customer_name": customer_name,
            "customer_email": customer_email,
            "status": payload.get("status") or "pending",
            "digital_items": digital_items,
            "digital_item_count": len(digital_items),
            "created_at": payload.get("created_at"),
            "updated_at": payload.get("updated_at"),
        })

    return sessions


def delete_admin_digital_checkout_session(session_id):
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        return False

    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    cursor.execute(
        f"DELETE FROM customer_checkout_sessions WHERE session_id = {placeholder}",
        (normalized_session_id,),
    )
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def mark_pattern_downloads_emailed(download_ids):
    ids = [int(entry) for entry in (download_ids or []) if str(entry).isdigit()]
    if not ids:
        return 0

    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    now = datetime.utcnow().isoformat()
    placeholders = ", ".join([placeholder] * len(ids))
    cursor.execute(
        f"""
        UPDATE customer_pattern_downloads
        SET last_emailed_at = {placeholder}, updated_at = {placeholder}
        WHERE id IN ({placeholders})
        """,
        (now, now, *ids),
    )
    updated_count = cursor.rowcount or 0
    conn.commit()
    conn.close()
    return int(updated_count)


def _order_item_requires_shipping(item):
    normalized_type = str(item.get("product_type") or "").strip().lower()
    product_id = str(item.get("product_id") or "").strip()

    if normalized_type in {"template", "pattern"}:
        return False

    if normalized_type == "manual":
        if product_id.isdigit():
            product = fetch_manual_product(int(product_id))
            if product is not None:
                return not bool(product.get("is_digital_download"))
        return True

    if normalized_type == "invoice":
        return False

    return True


def list_admin_shipping_orders(limit=250):
    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    limit_value = max(1, min(int(limit or 250), 500))

    cursor.execute(
        f"""
        SELECT
            o.*,
            c.first_name,
            c.last_name,
            c.email AS account_email
        FROM customer_orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE LOWER(COALESCE(o.payment_status, '')) = 'paid'
          AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'payment_failed')
        ORDER BY o.updated_at DESC, o.created_at DESC
        LIMIT {placeholder}
        """,
        (limit_value,),
    )
    order_rows = [dict(row) for row in cursor.fetchall()]
    if not order_rows:
        conn.close()
        return []

    order_ids = [int(entry.get("id")) for entry in order_rows if entry.get("id") is not None]
    item_map = {order_id: [] for order_id in order_ids}
    if order_ids:
        placeholders = ", ".join([placeholder] * len(order_ids))
        cursor.execute(
            f"""
            SELECT order_id, id, product_type, product_id, title, quantity, price, image_url
            FROM customer_order_items
            WHERE order_id IN ({placeholders})
            ORDER BY id ASC
            """,
            tuple(order_ids),
        )
        for row in cursor.fetchall():
            payload = dict(row)
            item_map.setdefault(payload.get("order_id"), []).append(payload)

    conn.close()

    needs_shipping = []
    already_shipped = []
    archived = []

    for order in order_rows:
        order_id = int(order.get("id")) if order.get("id") is not None else None
        items = item_map.get(order_id, [])
        physical_items = [entry for entry in items if _order_item_requires_shipping(entry)]
        if not physical_items:
            continue

        first_name = str(order.get("first_name") or "").strip()
        last_name = str(order.get("last_name") or "").strip()
        customer_name = " ".join([part for part in [first_name, last_name] if part]).strip()
        normalized_status = str(order.get("status") or "").strip().lower()
        shipping_status = normalized_status
        if normalized_status not in {"shipped", "completed"}:
            shipping_status = "need_to_ship"

        payload = {
            **order,
            "customer_name": customer_name or str(order.get("customer_name") or "").strip() or "Customer",
            "customer_email": str(order.get("customer_email") or "").strip() or str(order.get("account_email") or "").strip(),
            "shipping_status": shipping_status,
            "item_count": len(items),
            "physical_item_count": len(physical_items),
            "items": physical_items,
        }

        if shipping_status == "completed":
            archived.append(payload)
        elif shipping_status == "shipped":
            already_shipped.append(payload)
        else:
            needs_shipping.append(payload)

    sort_key = lambda entry: str(entry.get("updated_at") or entry.get("created_at") or "")
    needs_shipping.sort(key=sort_key, reverse=True)
    already_shipped.sort(key=sort_key, reverse=True)
    archived.sort(key=sort_key, reverse=True)
    return needs_shipping + already_shipped + archived


def update_admin_customer_order_status(order_id, new_status):
    normalized = str(new_status or "").strip().lower()
    if normalized == "need_to_ship":
        normalized = "confirmed"
    if normalized == "archived":
        normalized = "completed"
    if normalized not in {"confirmed", "shipped", "completed"}:
        raise ValueError("invalid_order_status")

    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    now = datetime.utcnow().isoformat()
    cursor.execute(
        f"""
        UPDATE customer_orders
        SET status = {placeholder}, updated_at = {placeholder}
        WHERE id = {placeholder}
        """,
        (normalized, now, order_id),
    )
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated


def list_admin_recent_orders(limit=20, unseen_only=False):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    limit_value = max(1, min(int(limit or 20), 100))

    where_clause = "WHERE o.admin_seen = 0" if unseen_only else ""
    cursor.execute(
        f"""
        SELECT
            o.*, c.first_name, c.last_name,
            c.email AS account_email,
            COUNT(oi.id) AS item_count
        FROM customer_orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN customer_order_items oi ON oi.order_id = o.id
        {where_clause}
        GROUP BY o.id, c.first_name, c.last_name, c.email
        ORDER BY o.created_at DESC
        LIMIT {placeholder}
        """,
        (limit_value,),
    )
    rows = cursor.fetchall()
    conn.close()
    orders = [dict(row) for row in rows]
    events_by_order_id = list_customer_order_events_for_orders([entry.get("id") for entry in orders], limit_per_order=8)
    for entry in orders:
        entry["events"] = events_by_order_id.get(entry.get("id"), [])
    return orders


def mark_customer_order_admin_seen(order_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    now = datetime.utcnow().isoformat()

    cursor.execute(
        f"""
        UPDATE customer_orders
        SET admin_seen = 1, admin_seen_at = {placeholder}, updated_at = {placeholder}
        WHERE id = {placeholder}
        """,
        (now, now, order_id),
    )
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated


def get_customer_order_id_by_payment_reference(payment_reference):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    cursor.execute(
        f"SELECT id FROM customer_orders WHERE payment_reference = {placeholder} LIMIT 1",
        (payment_reference,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return row.get("id") if isinstance(row, dict) else row["id"]


def append_customer_order_event(order_id, event_type, event_detail=None, payload=None):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    now = datetime.utcnow().isoformat()

    cursor.execute(
        f"""
        INSERT INTO customer_order_events (order_id, event_type, event_detail, payload, created_at)
        VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
        """,
        (order_id, event_type, event_detail, payload, now),
    )
    conn.commit()
    conn.close()


def list_customer_order_events(order_id, limit=20):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    limit_value = max(1, min(int(limit or 20), 100))

    cursor.execute(
        f"""
        SELECT id, order_id, event_type, event_detail, payload, created_at
        FROM customer_order_events
        WHERE order_id = {placeholder}
        ORDER BY created_at DESC
        LIMIT {placeholder}
        """,
        (order_id, limit_value),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def list_customer_order_events_for_orders(order_ids, limit_per_order=5):
    normalized_ids = [int(oid) for oid in order_ids if oid is not None]
    if not normalized_ids:
        return {}

    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    is_postgres = _is_postgres_backend()
    placeholder = "%s" if is_mysql else "?"
    per_order_cap = max(1, min(int(limit_per_order or 5), 25))

    if is_postgres:
        cursor.execute(
            f"""
            SELECT id, order_id, event_type, event_detail, payload, created_at
            FROM (
                SELECT
                    id,
                    order_id,
                    event_type,
                    event_detail,
                    payload,
                    created_at,
                    ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at DESC) AS rn
                FROM customer_order_events
                WHERE order_id = ANY({placeholder})
            ) ranked
            WHERE rn <= {placeholder}
            ORDER BY order_id, created_at DESC
            """,
            (normalized_ids, per_order_cap),
        )
    else:
        placeholders = ", ".join([placeholder] * len(normalized_ids))
        cursor.execute(
            f"""
            SELECT id, order_id, event_type, event_detail, payload, created_at
            FROM customer_order_events
            WHERE order_id IN ({placeholders})
            ORDER BY created_at DESC
            """,
            tuple(normalized_ids),
        )

    rows = cursor.fetchall()
    conn.close()

    grouped = {order_id: [] for order_id in normalized_ids}
    for row in rows:
        payload = dict(row)
        order_id = payload.get("order_id")
        if order_id not in grouped:
            grouped[order_id] = []
        if len(grouped[order_id]) >= per_order_cap:
            continue
        grouped[order_id].append(payload)
    return grouped


def update_customer_order_payment_by_reference(payment_reference, payment_status, order_status=None):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    now = datetime.utcnow().isoformat()

    if order_status is None:
        cursor.execute(
            f"""
            UPDATE customer_orders
            SET payment_status = {placeholder}, updated_at = {placeholder}
            WHERE payment_reference = {placeholder}
            """,
            (payment_status, now, payment_reference),
        )
    else:
        cursor.execute(
            f"""
            UPDATE customer_orders
            SET payment_status = {placeholder}, status = {placeholder}, updated_at = {placeholder}
            WHERE payment_reference = {placeholder}
            """,
            (payment_status, order_status, now, payment_reference),
        )

    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated


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


def list_customer_order_items_for_order(order_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"SELECT * FROM customer_order_items WHERE order_id = {placeholder} ORDER BY id ASC",
        (order_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def _fetch_template_download_metadata(cursor, template_id):
    if not template_id:
        return None

    placeholder = _placeholder()
    cursor.execute(
        f"""
        SELECT
            id,
            name,
            description,
            template_type,
            svg_content,
            image_url,
            image_data,
            image_mime,
            thumbnail_url,
            price_amount,
            price_currency,
            is_active
        FROM templates
        WHERE id = {placeholder}
        LIMIT 1
        """,
        (template_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None

    payload = dict(row)
    return {
        "pattern_id": payload.get("id"),
        "pattern_name": payload.get("name"),
        "pattern_description": payload.get("description"),
        "pattern_source_type": "template",
        "template_id": payload.get("id"),
        "template_name": payload.get("name"),
        "template_description": payload.get("description"),
        "template_type": payload.get("template_type"),
        "svg_content": payload.get("svg_content"),
        "image_url": payload.get("image_url"),
        "image_data": payload.get("image_data"),
        "image_mime": payload.get("image_mime"),
        "thumbnail_url": payload.get("thumbnail_url"),
        "price_amount": payload.get("price_amount"),
        "price_currency": payload.get("price_currency"),
        "is_active": payload.get("is_active"),
    }


def _fetch_manual_product_download_metadata(cursor, manual_product_id):
    if not manual_product_id:
        return None

    placeholder = _placeholder()
    cursor.execute(
        f"""
        SELECT
            p.id,
            p.name,
            p.description,
            p.price,
            p.is_digital_download,
            p.related_links,
            (
                SELECT pi.image_url
                FROM product_images pi
                WHERE pi.product_id = p.id
                ORDER BY pi.display_order
                LIMIT 1
            ) AS image_url
        FROM manual_products p
        WHERE p.id = {placeholder}
        LIMIT 1
        """,
        (manual_product_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None

    payload = dict(row)
    related_links = _deserialize_related_links(payload.get("related_links")) or {}
    template_metadata = None
    template_id = related_links.get("template_id")
    if template_id not in (None, ""):
        try:
            template_metadata = _fetch_template_download_metadata(cursor, int(template_id))
        except (TypeError, ValueError):
            template_metadata = None

    template_image_url = (template_metadata or {}).get("image_url")
    template_image_data = (template_metadata or {}).get("image_data")
    template_image_mime = (template_metadata or {}).get("image_mime")
    template_svg_content = (template_metadata or {}).get("svg_content")
    return {
        "pattern_id": payload.get("id"),
        "pattern_name": payload.get("name"),
        "pattern_description": payload.get("description"),
        "pattern_source_type": "manual",
        "manual_product_id": payload.get("id"),
        "template_id": (template_metadata or {}).get("template_id") or related_links.get("template_id"),
        "template_name": (template_metadata or {}).get("template_name") or related_links.get("template_name"),
        "template_description": (template_metadata or {}).get("template_description"),
        "template_type": (template_metadata or {}).get("template_type"),
        "price_amount": payload.get("price"),
        "price_currency": "USD",
        "svg_content": template_svg_content,
        "image_url": template_image_url or payload.get("image_url"),
        "image_data": template_image_data,
        "image_mime": template_image_mime,
        "thumbnail_url": (template_metadata or {}).get("thumbnail_url"),
        "is_active": _coerce_bool(payload.get("is_digital_download")),
    }


def get_manual_product_download_metadata(manual_product_id):
    conn = get_db()
    cursor = conn.cursor()
    metadata = _fetch_manual_product_download_metadata(cursor, manual_product_id)
    conn.close()
    return metadata


def upsert_customer_pattern_download(customer_id, product_type, product_id, order_id=None, customer_email=None):
    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    now = datetime.utcnow().isoformat()

    normalized_type = "manual" if str(product_type or "").strip().lower() == "manual" else "template"
    target_id = int(product_id)
    template_id = target_id if normalized_type == "template" else None
    manual_product_id = target_id if normalized_type == "manual" else None

    if normalized_type == "manual":
        cursor.execute(
            f"""
            SELECT id, download_token
            FROM customer_pattern_downloads
            WHERE customer_id = {placeholder} AND product_type = {placeholder} AND manual_product_id = {placeholder}
            LIMIT 1
            """,
            (customer_id, normalized_type, manual_product_id),
        )
    else:
        cursor.execute(
            f"""
            SELECT id, download_token
            FROM customer_pattern_downloads
            WHERE customer_id = {placeholder} AND product_type = {placeholder} AND template_id = {placeholder}
            LIMIT 1
            """,
            (customer_id, normalized_type, template_id),
        )
    row = cursor.fetchone()

    if row:
        download_token = row.get("download_token") or secrets.token_urlsafe(32)
        cursor.execute(
            f"""
            UPDATE customer_pattern_downloads
            SET product_type = {placeholder}, template_id = {placeholder}, manual_product_id = {placeholder}, order_id = {placeholder}, customer_email = {placeholder}, download_token = {placeholder}, unlocked_at = {placeholder}, updated_at = {placeholder}
            WHERE id = {placeholder}
            """,
            (normalized_type, template_id, manual_product_id, order_id, customer_email, download_token, now, now, row["id"]),
        )
        download_id = row["id"]
        created = False
    else:
        download_token = secrets.token_urlsafe(32)
        if _is_postgres_backend():
            cursor.execute(
                f"""
                INSERT INTO customer_pattern_downloads (customer_id, template_id, manual_product_id, product_type, order_id, customer_email, download_token, unlocked_at, created_at, updated_at)
                VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
                RETURNING id
                """,
                (customer_id, template_id, manual_product_id, normalized_type, order_id, customer_email, download_token, now, now, now),
            )
            download_id = cursor.fetchone()["id"]
        else:
            cursor.execute(
                f"""
                INSERT INTO customer_pattern_downloads (customer_id, template_id, manual_product_id, product_type, order_id, customer_email, download_token, unlocked_at, created_at, updated_at)
                VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
                """,
                (customer_id, template_id, manual_product_id, normalized_type, order_id, customer_email, download_token, now, now, now),
            )
            download_id = cursor.lastrowid
        created = True

    conn.commit()
    conn.close()
    return {
        "id": download_id,
        "download_token": download_token,
        "created": created,
        "customer_id": customer_id,
        "product_type": normalized_type,
        "template_id": template_id,
        "manual_product_id": manual_product_id,
        "order_id": order_id,
    }


def list_customer_pattern_downloads(customer_id):
    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    cursor.execute(
        f"""
        SELECT
            d.*,
            o.order_number,
            o.payment_status
        FROM customer_pattern_downloads d
        LEFT JOIN customer_orders o ON o.id = d.order_id
        WHERE d.customer_id = {placeholder}
        ORDER BY d.updated_at DESC, d.created_at DESC
        """,
        (customer_id,),
    )
    rows = cursor.fetchall()
    downloads = []
    for row in rows:
        payload = dict(row)
        normalized_type = str(payload.get("product_type") or "template").strip().lower()
        if normalized_type == "manual":
            metadata = _fetch_manual_product_download_metadata(cursor, payload.get("manual_product_id"))
        else:
            metadata = _fetch_template_download_metadata(cursor, payload.get("template_id"))
        if metadata:
            payload.update(metadata)
        downloads.append(payload)
    conn.close()
    return downloads


def get_customer_pattern_download_by_token(download_token):
    conn = get_db()
    cursor = conn.cursor()
    placeholder = _placeholder()
    cursor.execute(
        f"""
        SELECT *
        FROM customer_pattern_downloads d
        WHERE d.download_token = {placeholder}
        LIMIT 1
        """,
        (download_token,),
    )
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None

    payload = dict(row)
    normalized_type = str(payload.get("product_type") or "template").strip().lower()
    if normalized_type == "manual":
        metadata = _fetch_manual_product_download_metadata(cursor, payload.get("manual_product_id"))
    else:
        metadata = _fetch_template_download_metadata(cursor, payload.get("template_id"))
    if metadata:
        payload.update(metadata)
    conn.close()
    return payload


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


def list_customer_review_options(customer_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"""
        SELECT
            oi.product_type,
            oi.product_id,
            MAX(o.created_at) AS last_purchased_at,
            MAX(COALESCE(oi.title, '')) AS title,
            MAX(COALESCE(oi.image_url, '')) AS image_url
        FROM customer_order_items oi
        JOIN customer_orders o ON o.id = oi.order_id
        WHERE o.customer_id = {placeholder}
        GROUP BY oi.product_type, oi.product_id
        ORDER BY last_purchased_at DESC
        """,
        (customer_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def list_reviews_for_product(product_type, product_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"""
                SELECT
                        r.*, c.first_name, c.last_name,
                        (
                                SELECT COALESCE(oi.image_url, '')
                                FROM customer_order_items oi
                                WHERE oi.product_type = r.product_type
                                    AND oi.product_id = r.product_id
                                    AND COALESCE(oi.image_url, '') <> ''
                                ORDER BY oi.id DESC
                                LIMIT 1
                        ) AS fallback_product_image_url,
                        COALESCE(
                            r.review_image_url,
                            (
                                SELECT COALESCE(oi.image_url, '')
                                FROM customer_order_items oi
                                WHERE oi.product_type = r.product_type
                                    AND oi.product_id = r.product_id
                                    AND COALESCE(oi.image_url, '') <> ''
                                ORDER BY oi.id DESC
                                LIMIT 1
                            )
                        ) AS product_image_url,
                        (
                                SELECT COALESCE(oi.title, '')
                                FROM customer_order_items oi
                                WHERE oi.product_type = r.product_type
                                    AND oi.product_id = r.product_id
                                    AND COALESCE(oi.title, '') <> ''
                                ORDER BY oi.id DESC
                                LIMIT 1
                        ) AS product_title
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
    return _normalize_review_image_fields(rows)


def list_recent_reviews(limit=10):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    safe_limit = max(1, min(int(limit or 10), 50))
    cursor.execute(
        f"""
                SELECT
                        r.*, c.first_name, c.last_name,
                        (
                                SELECT COALESCE(oi.image_url, '')
                                FROM customer_order_items oi
                                WHERE oi.product_type = r.product_type
                                    AND oi.product_id = r.product_id
                                    AND COALESCE(oi.image_url, '') <> ''
                                ORDER BY oi.id DESC
                                LIMIT 1
                        ) AS fallback_product_image_url,
                        COALESCE(
                            r.review_image_url,
                            (
                                SELECT COALESCE(oi.image_url, '')
                                FROM customer_order_items oi
                                WHERE oi.product_type = r.product_type
                                    AND oi.product_id = r.product_id
                                    AND COALESCE(oi.image_url, '') <> ''
                                ORDER BY oi.id DESC
                                LIMIT 1
                            )
                        ) AS product_image_url,
                        (
                                SELECT COALESCE(oi.title, '')
                                FROM customer_order_items oi
                                WHERE oi.product_type = r.product_type
                                    AND oi.product_id = r.product_id
                                    AND COALESCE(oi.title, '') <> ''
                                ORDER BY oi.id DESC
                                LIMIT 1
                        ) AS product_title
        FROM customer_reviews r
        JOIN customers c ON c.id = r.customer_id
        WHERE r.status = 'approved'
        ORDER BY r.created_at DESC
        LIMIT {placeholder}
        """,
        (safe_limit,),
    )
    rows = cursor.fetchall()
    conn.close()
    return _normalize_review_image_fields(rows)


def create_customer_invoice(customer_id, work_order_id, invoice_number, amount, due_date=None, notes=None):
    """Create a new invoice for a customer."""
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    is_postgres = _is_postgres_backend()
    now = datetime.utcnow().isoformat()

    insert_values = [
        work_order_id,
        customer_id,
        invoice_number or f"INV-{datetime.utcnow().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}",
        "open",
        amount,
        due_date,
        notes,
        now,
        now,
    ]

    if is_postgres:
        cursor.execute(
            f"""
            INSERT INTO customer_invoices (
                work_order_id, customer_id, invoice_number, status, amount, due_date, notes, created_at, updated_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            RETURNING id
            """,
            insert_values,
        )
        invoice_id = cursor.fetchone()["id"]
    else:
        cursor.execute(
            f"""
            INSERT INTO customer_invoices (
                work_order_id, customer_id, invoice_number, status, amount, due_date, notes, created_at, updated_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            """,
            insert_values,
        )
        invoice_id = cursor.lastrowid

    conn.commit()
    conn.close()
    return invoice_id


def peek_next_custom_work_order_number():
    """Return the next CWO-YYYY-#### value without reserving it."""
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    year = datetime.utcnow().year

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS custom_work_order_sequences (
            year INTEGER PRIMARY KEY,
            next_value INTEGER NOT NULL
        )
        """
    )

    cursor.execute(
        f"SELECT next_value FROM custom_work_order_sequences WHERE year = {placeholder}",
        (year,),
    )
    row = cursor.fetchone()
    conn.close()

    next_value = int((row or {}).get("next_value") or 1)
    return f"CWO-{year}-{next_value:04d}"


def reserve_next_custom_work_order_number():
    """Atomically reserve and return the next CWO-YYYY-#### value."""
    conn = get_db()
    cursor = conn.cursor()
    year = datetime.utcnow().year

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS custom_work_order_sequences (
            year INTEGER PRIMARY KEY,
            next_value INTEGER NOT NULL
        )
        """
    )

    cursor.execute(
        """
        INSERT INTO custom_work_order_sequences (year, next_value)
        VALUES (%s, 2)
        ON CONFLICT (year)
        DO UPDATE SET next_value = custom_work_order_sequences.next_value + 1
        RETURNING next_value - 1 AS reserved_value
        """,
        (year,),
    )
    row = cursor.fetchone() or {}
    conn.commit()
    conn.close()

    reserved_value = int(row.get("reserved_value") or 1)
    return f"CWO-{year}-{reserved_value:04d}"


def list_customer_invoices(customer_id, status_filter=None):
    """List invoices for a customer, optionally filtered by status."""
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    if status_filter:
        cursor.execute(
            f"""
            SELECT * FROM customer_invoices
            WHERE customer_id = {placeholder} AND status = {placeholder}
            ORDER BY created_at DESC
            """,
            (customer_id, status_filter),
        )
    else:
        cursor.execute(
            f"""
            SELECT * FROM customer_invoices
            WHERE customer_id = {placeholder}
            ORDER BY created_at DESC
            """,
            (customer_id,),
        )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_invoice_by_id(invoice_id, customer_id=None):
    """Get a specific invoice by ID, optionally verify it belongs to a customer."""
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    if customer_id:
        cursor.execute(
            f"""
            SELECT * FROM customer_invoices
            WHERE id = {placeholder} AND customer_id = {placeholder}
            """,
            (invoice_id, customer_id),
        )
    else:
        cursor.execute(
            f"SELECT * FROM customer_invoices WHERE id = {placeholder}",
            (invoice_id,),
        )

    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_invoice_status(invoice_id, new_status):
    """Update the status of an invoice."""
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    now = datetime.utcnow().isoformat()

    cursor.execute(
        f"""
        UPDATE customer_invoices
        SET status = {placeholder}, updated_at = {placeholder}
        WHERE id = {placeholder}
        """,
        (new_status, now, invoice_id),
    )
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated


def list_admin_invoices(status_filter=None, customer_id=None):
    """List invoices across all customers for admin management."""
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    where = []
    params = []

    if status_filter:
        where.append(f"i.status = {placeholder}")
        params.append(status_filter)
    if customer_id:
        where.append(f"i.customer_id = {placeholder}")
        params.append(customer_id)

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    cursor.execute(
        f"""
        SELECT
            i.*,
            c.first_name,
            c.last_name,
            c.email
        FROM customer_invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
        {where_sql}
        ORDER BY i.created_at DESC
        """,
        tuple(params),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def update_admin_invoice(invoice_id, *, status=None, amount=None, due_date=None, notes=None):
    """Update editable invoice fields from admin tools."""
    updates = []
    values = []
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    now = datetime.utcnow().isoformat()

    if status is not None:
        updates.append(f"status = {placeholder}")
        values.append(status)
    if amount is not None:
        updates.append(f"amount = {placeholder}")
        values.append(amount)
    if due_date is not None:
        updates.append(f"due_date = {placeholder}")
        values.append(due_date)
    if notes is not None:
        updates.append(f"notes = {placeholder}")
        values.append(notes)

    if not updates:
        return False

    updates.append(f"updated_at = {placeholder}")
    values.append(now)
    values.append(invoice_id)

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        f"""
        UPDATE customer_invoices
        SET {', '.join(updates)}
        WHERE id = {placeholder}
        """,
        tuple(values),
    )
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated


def delete_invoice(invoice_id):
    """Hard-delete an invoice for admin cleanup."""
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    is_postgres = _is_postgres_backend()
    placeholder = "%s" if is_mysql else "?"
    if is_postgres:
        cursor.execute(
            f"DELETE FROM customer_invoices WHERE id = {placeholder} RETURNING id",
            (invoice_id,),
        )
        deleted = cursor.fetchone() is not None
    else:
        cursor.execute(
            f"DELETE FROM customer_invoices WHERE id = {placeholder}",
            (invoice_id,),
        )
        deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


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
    normalized = []
    for row in rows:
        payload = dict(row)
        payload.pop("review_image_data", None)
        normalized.append(payload)
    return normalized


def list_admin_reviews(limit=200, status=None):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    safe_limit = max(1, min(int(limit or 200), 500))
    status_filter = str(status or "").strip().lower()

    if status_filter:
        cursor.execute(
            f"""
            SELECT r.*, c.first_name, c.last_name
            FROM customer_reviews r
            JOIN customers c ON c.id = r.customer_id
            WHERE r.status = {placeholder}
            ORDER BY r.created_at DESC
            LIMIT {placeholder}
            """,
            (status_filter, safe_limit),
        )
    else:
        cursor.execute(
            f"""
            SELECT r.*, c.first_name, c.last_name
            FROM customer_reviews r
            JOIN customers c ON c.id = r.customer_id
            ORDER BY r.created_at DESC
            LIMIT {placeholder}
            """,
            (safe_limit,),
        )

    rows = cursor.fetchall()
    conn.close()
    return _normalize_review_image_fields(rows)


def update_admin_review(review_id, payload):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    updates = []
    values = []

    if "rating" in payload:
        updates.append(f"rating = {placeholder}")
        values.append(int(payload.get("rating") or 0))
    if "title" in payload:
        updates.append(f"title = {placeholder}")
        values.append(payload.get("title"))
    if "body" in payload:
        updates.append(f"body = {placeholder}")
        values.append(payload.get("body"))
    if "admin_comment" in payload:
        updates.append(f"admin_comment = {placeholder}")
        values.append(payload.get("admin_comment"))
    if "review_image_url" in payload:
        updates.append(f"review_image_url = {placeholder}")
        values.append(payload.get("review_image_url"))
    if "review_image_data" in payload:
        updates.append(f"review_image_data = {placeholder}")
        values.append(payload.get("review_image_data"))
    if "review_image_mime" in payload:
        updates.append(f"review_image_mime = {placeholder}")
        values.append(payload.get("review_image_mime"))
    if "status" in payload:
        updates.append(f"status = {placeholder}")
        values.append(str(payload.get("status") or "").strip().lower())

    if not updates:
        conn.close()
        return False

    updates.append(f"updated_at = {placeholder}")
    values.append(now)
    values.append(review_id)

    cursor.execute(
        f"""
        UPDATE customer_reviews
        SET {", ".join(updates)}
        WHERE id = {placeholder}
        """,
        tuple(values),
    )
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated


def delete_admin_review(review_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"DELETE FROM customer_reviews WHERE id = {placeholder}",
        (review_id,),
    )
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def create_customer_review(customer_id, payload, verified_purchase, status=None):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_postgres = _is_postgres_backend()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    resolved_status = str(status or ("approved" if verified_purchase else "pending")).strip().lower()
    values = (
        customer_id,
        payload["product_type"],
        payload["product_id"],
        payload["rating"],
        payload.get("title"),
        payload.get("body"),
        payload.get("review_image_url"),
        payload.get("review_image_data"),
        payload.get("review_image_mime"),
        payload.get("admin_comment"),
        1 if verified_purchase else 0,
        resolved_status,
        now,
        now,
    )
    if is_postgres:
        cursor.execute(
            f"""
            INSERT INTO customer_reviews (
                customer_id, product_type, product_id, rating, title, body,
                review_image_url, review_image_data, review_image_mime,
                admin_comment, verified_purchase, status, created_at, updated_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder},
                      {placeholder}, {placeholder}, {placeholder},
                      {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            RETURNING id
            """,
            values,
        )
        review_id = cursor.fetchone()["id"]
    else:
        cursor.execute(
            f"""
            INSERT INTO customer_reviews (
                customer_id, product_type, product_id, rating, title, body,
                review_image_url, review_image_data, review_image_mime,
                admin_comment, verified_purchase, status, created_at, updated_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder},
                      {placeholder}, {placeholder}, {placeholder},
                      {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            """,
            values,
        )
        review_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return review_id


def update_customer_review(customer_id, review_id, payload):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    updates = []
    values = []

    if "rating" in payload:
        updates.append(f"rating = {placeholder}")
        values.append(int(payload.get("rating") or 0))
    if "title" in payload:
        updates.append(f"title = {placeholder}")
        values.append(payload.get("title"))
    if "body" in payload:
        updates.append(f"body = {placeholder}")
        values.append(payload.get("body"))

    if not updates:
        conn.close()
        return False

    updates.append(f"status = {placeholder}")
    values.append("pending")
    updates.append(f"updated_at = {placeholder}")
    values.append(now)
    values.extend([review_id, customer_id])

    cursor.execute(
        f"""
        UPDATE customer_reviews
        SET {", ".join(updates)}
        WHERE id = {placeholder} AND customer_id = {placeholder}
        """,
        tuple(values),
    )
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated


def create_review_invite_code(code_hash, payload):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_postgres = _is_postgres_backend()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    raw_max_uses = payload.get("max_uses")
    max_uses = None if raw_max_uses in (None, "") else int(raw_max_uses)

    values = (
        code_hash,
        payload.get("product_type"),
        payload.get("product_id"),
        payload.get("product_name"),
        payload.get("note"),
        max_uses,
        payload.get("expires_at"),
        payload.get("created_by"),
        now,
        now,
    )

    if is_postgres:
        cursor.execute(
            f"""
            INSERT INTO review_invite_codes (
                code_hash, product_type, product_id, product_name, note,
                max_uses, expires_at, created_by, created_at, updated_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder},
                      {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            RETURNING id
            """,
            values,
        )
        invite_id = cursor.fetchone()["id"]
    else:
        cursor.execute(
            f"""
            INSERT INTO review_invite_codes (
                code_hash, product_type, product_id, product_name, note,
                max_uses, expires_at, created_by, created_at, updated_at
            ) VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder},
                      {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
            """,
            values,
        )
        invite_id = cursor.lastrowid

    conn.commit()
    conn.close()
    return invite_id


def list_review_invite_codes(limit=200, active_only=False):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    safe_limit = max(1, min(int(limit or 200), 500))

    where_sql = ""
    params = [safe_limit]
    if active_only:
        now = datetime.utcnow().isoformat()
        where_sql = f"WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > {placeholder}) AND (max_uses IS NULL OR used_count < max_uses)"
        params = [now, safe_limit]

    cursor.execute(
        f"""
        SELECT *
        FROM review_invite_codes
        {where_sql}
        ORDER BY created_at DESC
        LIMIT {placeholder}
        """,
        tuple(params),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_review_invite_code_by_hash(code_hash):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"SELECT * FROM review_invite_codes WHERE code_hash = {placeholder}",
        (code_hash,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def consume_review_invite_code(invite_id):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"

    cursor.execute(
        f"""
        UPDATE review_invite_codes
        SET used_count = used_count + 1,
            updated_at = {placeholder}
        WHERE id = {placeholder}
          AND is_active = 1
          AND (expires_at IS NULL OR expires_at > {placeholder})
                    AND (max_uses IS NULL OR used_count < max_uses)
        """,
        (now, invite_id, now),
    )
    consumed = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return consumed


def delete_review_invite_code(invite_id):
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    cursor.execute(
        f"DELETE FROM review_invite_codes WHERE id = {placeholder}",
        (invite_id,),
    )
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted
