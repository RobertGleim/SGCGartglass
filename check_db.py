import sqlite3

conn = sqlite3.connect('backend/data.db')
cursor = conn.cursor()

print("Tables in database:")
tables = cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
for table in tables:
    print(f"  {table[0]}")

print("\nmanual_products schema:")
cols = cursor.execute("PRAGMA table_info(manual_products)").fetchall()
for col in cols:
    print(f"  {col}")

print("\nproduct_images schema:")
cols = cursor.execute("PRAGMA table_info(product_images)").fetchall()
for col in cols:
    print(f"  {col}")

print("\nExisting manual products:")
products = cursor.execute("SELECT id, name FROM manual_products").fetchall()
for p in products:
    print(f"  ID {p[0]}: {p[1]}")

conn.close()
