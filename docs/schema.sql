CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etsy_listing_id TEXT NOT NULL UNIQUE,
    title TEXT,
    description TEXT,
    price_amount TEXT,
    price_currency TEXT,
    image_url TEXT,
    etsy_url TEXT,
    updated_at TEXT
);

CREATE TABLE manual_products (
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
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    media_type TEXT DEFAULT 'image',
    display_order INTEGER DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES manual_products(id) ON DELETE CASCADE
);
