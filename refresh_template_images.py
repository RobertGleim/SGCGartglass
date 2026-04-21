from __future__ import annotations

import os
from pathlib import Path

from backend.app import create_app
from backend.models import Template, db
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
            template.image_data = rendered_bytes
            template.image_mime = "image/png"

            image_url = old_image_url
            if image_url and not image_url.lower().endswith(".png"):
                image_url = os.path.splitext(image_url)[0] + ".png"
            template.image_url = image_url or template.image_url

            thumbnail_url = str(template.thumbnail_url or "").strip()
            if thumbnail_url and not thumbnail_url.lower().endswith(".png"):
                template.thumbnail_url = os.path.splitext(thumbnail_url)[0] + ".png"

            if old_image_url and old_image_url != template.image_url and old_image_url.startswith("/uploads/templates/"):
                old_disk_path = Path(app.root_path) / old_image_url.lstrip("/")
                if old_disk_path.exists():
                    old_disk_path.unlink()

            _write_template_cache_file(app, template.image_url, rendered_bytes)
            updated += 1

        db.session.commit()

    print(f"Updated {updated} image templates; skipped {skipped}.")


if __name__ == "__main__":
    main()