"""
Delete all linked products (Etsy items) from the database.
This script removes all entries from the 'items' table.
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from backend.db import get_db, _use_mysql

def delete_all_linked_products():
    """Delete all items from the items table."""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        # Count items before deletion
        cursor.execute("SELECT COUNT(*) FROM items")
        count_before = cursor.fetchone()[0]
        print(f"Found {count_before} linked product(s) in the database.")
        
        if count_before == 0:
            print("No linked products to delete.")
            return
        
        # Delete all items
        cursor.execute("DELETE FROM items")
        conn.commit()
        
        # Verify deletion
        cursor.execute("SELECT COUNT(*) FROM items")
        count_after = cursor.fetchone()[0]
        
        print(f"Deleted {count_before} linked product(s).")
        print(f"Remaining items: {count_after}")
        
        if count_after == 0:
            print("✓ All linked products have been successfully deleted.")
        else:
            print(f"⚠ Warning: {count_after} item(s) still remain in the database.")
            
    except Exception as e:
        print(f"Error deleting linked products: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    print("=" * 60)
    print("DELETE LINKED PRODUCTS (Etsy Items)")
    print("=" * 60)
    
    response = input("\nThis will delete ALL linked products from the database.\nAre you sure? (yes/no): ")
    
    if response.lower() in ['yes', 'y']:
        delete_all_linked_products()
    else:
        print("Operation cancelled.")
