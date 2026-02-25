"""Export glass types from local database to production MySQL"""
import os
from backend.db import get_db, _use_mysql

def export_local_glass_types():
    """Get glass types from current local database"""
    # Temporarily set environment to use local database
    original_env = os.environ.get('DATABASE_URL')
    
    # Clear DATABASE_URL to force local SQLite/MySQL usage
    if 'DATABASE_URL' in os.environ:
        del os.environ['DATABASE_URL']
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT id, name, description, texture_url, is_active, display_order, created_at, updated_at 
        FROM glass_types 
        ORDER BY display_order
    """)
    
    rows = cursor.fetchall()
    
    glass_types = []
    for row in rows:
        glass_types.append({
            'id': row[0],
            'name': row[1],
            'description': row[2],
            'texture_url': row[3],
            'is_active': row[4],
            'display_order': row[5],
            'created_at': row[6],
            'updated_at': row[7]
        })
    
    conn.close()
    
    # Restore original environment
    if original_env:
        os.environ['DATABASE_URL'] = original_env
    
    print(f"✅ Found {len(glass_types)} glass types in localhost")
    for gt in glass_types:
        print(f"  - {gt['name']} (order: {gt['display_order']})")
    
    return glass_types

def get_production_glass_types():
    """Get existing glass types from production MySQL"""
    # Set environment to production
    os.environ['DATABASE_URL'] = 'mysql+pymysql://u159464737_sgcgart:wG+6EI5z-a&9@srv1224.hstgr.io:3306/u159464737_sgcgdb'
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM glass_types")
    existing = [row[0] for row in cursor.fetchall()]
    
    conn.close()
    return existing

def import_to_production(glass_types):
    """Import glass types to production MySQL, skipping duplicates"""
    if not glass_types:
        print("No glass types to import")
        return
    
    existing = get_production_glass_types()
    print(f"\n📊 Production already has {len(existing)} glass types:")
    for name in existing:
        print(f"  - {name}")
    
    # Set environment to production
    os.environ['DATABASE_URL'] = 'mysql+pymysql://u159464737_sgcgart:wG+6EI5z-a&9@srv1224.hstgr.io:3306/u159464737_sgcgdb'
    
    conn = get_db()
    cursor = conn.cursor()
    is_mysql = _use_mysql()
    placeholder = "%s" if is_mysql else "?"
    
    imported = 0
    skipped = 0
    
    for gt in glass_types:
        if gt['name'] in existing:
            print(f"⏭️  Skipping '{gt['name']}' (already exists)")
            skipped += 1
            continue
        
        cursor.execute(f"""
            INSERT INTO glass_types (name, description, texture_url, is_active, display_order, created_at, updated_at)
            VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder}, {placeholder})
        """, (
            gt['name'],
            gt['description'],
            gt['texture_url'],
            gt['is_active'],
            gt['display_order'],
            gt['created_at'],
            gt['updated_at']
        ))
        
        print(f"✅ Imported '{gt['name']}'")
        imported += 1
    
    conn.commit()
    conn.close()
    
    print(f"\n🎉 Import complete!")
    print(f"  - Imported: {imported}")
    print(f"  - Skipped (duplicates): {skipped}")
    print(f"  - Total in production: {len(existing) + imported}")

if __name__ == '__main__':
    print("=" * 60)
    print("Glass Types Migration Tool")
    print("=" * 60)
    
    # Export from local
    local_types = export_local_glass_types()
    
    if not local_types:
        print("\n❌ No glass types found to export. Exiting.")
        exit(1)
    
    # Ask for confirmation
    print(f"\n⚠️  About to import {len(local_types)} glass types to production")
    print("This will NOT delete existing data. Duplicates will be skipped.")
    response = input("\nContinue? (yes/no): ").strip().lower()
    
    if response != 'yes':
        print("❌ Import cancelled")
        exit(0)
    
    # Import to production
    import_to_production(local_types)
