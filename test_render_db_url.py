"""Test the exact DATABASE_URL that Render is using"""
import os
import pymysql
from urllib.parse import urlparse, unquote

# The exact URL from Render
db_url = "mysql+pymysql://u159464737_sgcgart:wG%2B6EI5z-a%269@srv1224.hstgr.io:3306/u159464737_sgcgdb"

# Parse it
parsed = urlparse(db_url)
password = unquote(parsed.password) if parsed.password else None
print(f"Host: {parsed.hostname}")
print(f"Port: {parsed.port}")
print(f"User: {parsed.username}")
print(f"Password (URL-encoded): {parsed.password}")
print(f"Password (decoded): {password}")
print(f"Database: {parsed.path.lstrip('/')}")

# Try to connect
print("\n🔌 Attempting connection...")
try:
    conn = pymysql.connect(
        host=parsed.hostname,
        port=parsed.port or 3306,
        user=parsed.username,
        password=password,
        database=parsed.path.lstrip('/'),
        connect_timeout=10
    )
    print("✅ Connection successful!")
    
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM glass_types")
    count = cursor.fetchone()[0]
    print(f"✅ Found {count} glass types in database")
    
    conn.close()
except Exception as e:
    print(f"❌ Connection failed: {e}")
    print(f"\nError type: {type(e).__name__}")
