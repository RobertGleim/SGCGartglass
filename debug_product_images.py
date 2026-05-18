"""Debug script: Check product images for pattern products."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

# Use dev SQLite mode
os.environ.setdefault("APP_ENV", "development")

from backend.db import get_db

conn = get_db()
cursor = conn.cursor()

# Get all pattern/digital products
cursor.execute(
    "SELECT id, name, is_digital_download, category, related_links "
    "FROM manual_products "
    "WHERE is_digital_download = 1 OR LOWER(category) LIKE '%pattern%' "
    "ORDER BY name"
)
products = cursor.fetchall()
print(f"Found {len(products)} digital/pattern products\n")

for p in products:
    pd = dict(p)
    pid = pd["id"]
    print(f"  [{pid}] {pd['name']}")
    print(f"        category={pd['category']!r}  digital={pd['is_digital_download']}")
    print(f"        related_links={pd['related_links']!r}")

    cursor.execute(
        "SELECT image_url, media_type, "
        "CASE WHEN image_data IS NOT NULL THEN 1 ELSE 0 END as has_data "
        "FROM product_images WHERE product_id = ? ORDER BY display_order",
        (pid,),
    )
    imgs = cursor.fetchall()
    if imgs:
        for img in imgs:
            imgd = dict(img)
            print(f"        image: url={imgd['image_url']!r}  has_data={imgd['has_data']}  type={imgd['media_type']}")
    else:
        print("        (no images in product_images)")
    print()

conn.close()
