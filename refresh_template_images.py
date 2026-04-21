from __future__ import annotations

import os
import uuid
from pathlib import Path

from backend.app import create_app
from backend.models import Template, db
from backend.db import fetch_manual_product, update_manual_product
from backend.services.pattern_render_service import render_numbered_pattern_raster


def _read_template_source_bytes(app, template):
    if template.image_data:
        return bytes(template.image_data)

    image_url = str(template.image_url or "").strip()
    if image_url.startswith("/uploads/templates/"):
        disk_path = Path(app.root_path) / image_url.lstrip("/")
        if disk_path.is_file():
            return disk_path.read_bytes()
    return None


def _write_template_cache_file(app, image_url, image_bytes):
    image_url = str(image_url or "").strip()
    if not image_url.startswith("/uploads/templates/"):
        return
    disk_path = Path(app.root_path) / image_url.lstrip("/")
    disk_path.parent.mkdir(parents=True, exist_ok=True)
    disk_path.write_bytes(image_bytes)


def _rotate_template_image_url(existing_url):
    existing_url = str(existing_url or "").strip()
    if not existing_url.startswith("/uploads/templates/"):
        return existing_url
    return f"/uploads/templates/{uuid.uuid4().hex}.png"


def _replace_manual_product_template_image(product_id, old_urls, new_url):
    product = fetch_manual_product(product_id)
    if not isinstance(product, dict):
        return

    images = product.get("images") if isinstance(product.get("images"), list) else []
    next_images = []
    changed = False
    for image in images:
        if not isinstance(image, dict):
            next_images.append(image)
            continue
        current_url = str(image.get("image_url") or image.get("url") or "").strip()
        if current_url in old_urls:
            next_entry = dict(image)
            next_entry["image_url"] = new_url
            next_entry["url"] = new_url
            next_images.append(next_entry)
            changed = True
        else:
            next_images.append(image)

    if not changed:
        return

    payload = {
        "name": product.get("name"),
        "description": product.get("description"),
        "category": product.get("category"),
        "materials": product.get("materials"),
        "width": product.get("width"),
        "height": product.get("height"),
        "depth": product.get("depth"),
        "price": product.get("price"),
        "old_price": product.get("old_price"),
        "discount_percent": product.get("discount_percent"),
        "quantity": product.get("quantity"),
        "is_featured": product.get("is_featured"),
        "is_digital_download": product.get("is_digital_download"),
        "related_links": product.get("related_links"),
        "images": next_images,
    }
    update_manual_product(product_id, payload)


def main():
    app = create_app()
    updated = 0
    skipped = 0

    with app.app_context():
        templates = Template.query.filter(Template.template_type == "image").all()
        for template in templates:
            source_bytes = _read_template_source_bytes(app, template)
            if not source_bytes:
                skipped += 1
                continue

            rendered_bytes = render_numbered_pattern_raster(source_bytes)
            if not rendered_bytes:
                skipped += 1
                continue

            old_image_url = str(template.image_url or "").strip()
            old_thumbnail_url = str(template.thumbnail_url or "").strip()
            template.image_data = rendered_bytes
            template.image_mime = "image/png"

            template.image_url = _rotate_template_image_url(old_image_url) or template.image_url
            template.thumbnail_url = template.image_url

            old_urls = {value for value in (old_image_url, old_thumbnail_url) if value}
            related_links = template.related_links if isinstance(template.related_links, dict) else {}
            pattern_product_id = related_links.get("pattern_product_id")
            if pattern_product_id not in (None, ""):
                try:
                    _replace_manual_product_template_image(int(pattern_product_id), old_urls, template.image_url)
                except (TypeError, ValueError):
                    pass

            for old_url in old_urls:
                if old_url == template.image_url or not old_url.startswith("/uploads/templates/"):
                    continue
                old_disk_path = Path(app.root_path) / old_url.lstrip("/")
                if old_disk_path.exists():
                    old_disk_path.unlink()

            _write_template_cache_file(app, template.image_url, rendered_bytes)
            updated += 1

        db.session.commit()

    print(f"Updated {updated} image templates; skipped {skipped}.")


if __name__ == "__main__":
    main()