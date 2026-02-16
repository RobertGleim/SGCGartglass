import sys
sys.path.insert(0, 'backend')

from db import init_db

print("Initializing database...")
init_db()
print("Database initialized successfully!")

import sqlite3
conn = sqlite3.connect('sgcg.db')
cursor = conn.cursor()

print("\nTables created:")
tables = cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
for table in tables:
    print(f"  {table[0]}")

conn.close()
