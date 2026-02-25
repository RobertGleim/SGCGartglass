"""Check what's actually in production database"""
import os
from backend.db import get_db

# Set to production MySQL
os.environ['DATABASE_URL'] = 'mysql+pymysql://u159464737_sgcgart:wG+6EI5z-a&9@srv1224.hstgr.io:3306/u159464737_sgcgdb'

conn = get_db()
cursor = conn.cursor()

# Check glass types
cursor.execute("SELECT COUNT(*) FROM glass_types")
count = cursor.fetchone()[0]
print(f"Total glass types in production: {count}")

if count > 0:
    cursor.execute("SELECT id, name, is_active, display_order FROM glass_types ORDER BY display_order LIMIT 10")
    print("\nFirst 10 glass types:")
    for row in cursor.fetchall():
        print(f"  ID: {row[0]}, Name: {row[1]}, Active: {row[2]}, Order: {row[3]}")
else:
    print("\n❌ No glass types found in production database!")
    
conn.close()
