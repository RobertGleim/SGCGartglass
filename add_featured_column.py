import sqlite3

conn = sqlite3.connect('backend/data.db')
cursor = conn.cursor()

# Add the is_featured column if it doesn't exist
try:
    cursor.execute("ALTER TABLE manual_products ADD COLUMN is_featured INTEGER DEFAULT 0")
    conn.commit()
    print("Successfully added is_featured column to manual_products table")
except sqlite3.OperationalError as e:
    if "duplicate column name" in str(e):
        print("is_featured column already exists")
    else:
        print(f"Error: {e}")

# Verify the column was added
cols = cursor.execute("PRAGMA table_info(manual_products)").fetchall()
print("\nUpdated manual_products schema:")
for col in cols:
    print(f"  {col}")

conn.close()
