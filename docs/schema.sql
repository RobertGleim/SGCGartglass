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
