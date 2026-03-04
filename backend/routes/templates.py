"""\nTemplate API: public list/get and admin CRUD (create, update, soft delete).\n"""
import os
import uuid
from flask import Blueprint, jsonify, request, current_app
from sqlalchemy import func
from werkzeug.utils import secure_filename

from ..models import db, Template, TemplateRegion
from ..services.template_service import (
    validate_template_data,
    parse_svg_regions,
    generate_thumbnail_png,
)

# Public: GET /api/templates, GET /api/templates/<id>
templates_bp = Blueprint("templates", __name__)

# Admin: POST/PUT/DELETE under /api/admin/templates (register with prefix /api/admin)
admin_templates_bp = Blueprint("admin_templates", __name__)

DEFAULT_LIMIT = 12
MAX_LIMIT = 50


def _require_admin(handler):
    """Placeholder: require admin auth. Integrate with require_auth + role check later."""
    # TODO: from ..auth import require_auth; check g.auth_payload.get("role") == "admin"
    return handler


@templates_bp.get("/templates")
def list_templates():
    """
    GET /api/templates
    Query: category (optional), limit (default 12, max 50), offset (default 0).
    Returns only active templates (is_active=True).
    """
    try:
        limit = request.args.get("limit", default=DEFAULT_LIMIT, type=int)
        offset = request.args.get("offset", default=0, type=int)
        category = request.args.get("category", default="", type=str).strip()

        limit = max(1, min(limit, MAX_LIMIT))
        offset = max(0, offset)

        q = Template.query.filter(Template.is_active.is_(True))
        if category:
            q = q.filter(func.lower(Template.category) == func.lower(category))
        q = q.order_by(Template.updated_at.desc(), Template.id.desc())
        total = q.count()
        items = q.offset(offset).limit(limit).all()

        return jsonify({
            "items": [t.to_dict(include_regions=True, include_svg=False) for t in items],
            "total": total,
            "limit": limit,
            "offset": offset,
        })
    except Exception as e:
        return jsonify({"error": "server_error", "detail": str(e)}), 500


@templates_bp.get("/templates/<int:template_id>")
def get_template(template_id):
    """
    GET /api/templates/<id>
    Returns template with regions and svg_content. 404 if not found or inactive.
    """
    try:
        template = Template.query.filter(
            Template.id == template_id,
            Template.is_active.is_(True),
        ).first()
        if not template:
            return jsonify({"error": "not_found", "detail": "Template not found"}), 404
        return jsonify(template.to_dict(include_regions=True, include_svg=True))
    except Exception as e:
        return jsonify({"error": "server_error", "detail": str(e)}), 500


@admin_templates_bp.get("/templates")
@_require_admin
def admin_list_templates():
    """
    GET /api/admin/templates
    Returns all templates (active and inactive), ordered by updated_at desc.
    """
    try:
        limit = request.args.get("limit", default=100, type=int)
        offset = request.args.get("offset", default=0, type=int)
        search = request.args.get("search", default="", type=str).strip()

        q = Template.query
        if search:
            q = q.filter(Template.name.ilike(f"%{search}%"))
        q = q.order_by(Template.updated_at.desc(), Template.id.desc())
        total = q.count()
        items = q.offset(offset).limit(limit).all()

        return jsonify({
            "items": [t.to_dict(include_regions=False, include_svg=False) for t in items],
            "total": total,
            "limit": limit,
            "offset": offset,
        })
    except Exception as e:
        return jsonify({"error": "server_error", "detail": str(e)}), 500


@admin_templates_bp.get("/templates/<int:template_id>")
@_require_admin
def admin_get_template(template_id):
    """
    GET /api/admin/templates/<id>
    Returns template including svg_content for admin editing.
    """
    try:
        template = Template.query.get(template_id)
        if not template:
            return jsonify({"error": "not_found", "detail": "Template not found"}), 404
        return jsonify(template.to_dict(include_regions=True, include_svg=True))
    except Exception as e:
        return jsonify({"error": "server_error", "detail": str(e)}), 500


@admin_templates_bp.post("/templates/upload-image")
@_require_admin
def upload_template_image():
    """
    POST /api/admin/templates/upload-image
    Accepts multipart file upload (JPEG, PNG — PDF is pre-rendered on frontend).
    Returns { image_url: '/static/uploads/templates/<filename>' }
    """
    try:
        f = request.files.get("file")
        if not f or not f.filename:
            return jsonify({"error": "validation_error", "detail": "No file provided"}), 400

        allowed_mime = {"image/jpeg", "image/png", "image/gif", "image/webp"}
        allowed_ext = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
        filename = secure_filename(f.filename or "upload")
        ext = os.path.splitext(filename)[1].lower()
        if ext not in allowed_ext:
            return jsonify({"error": "validation_error", "detail": f"Unsupported file type: {ext}. Use JPEG or PNG."}), 400

        # Read file bytes for DB persistence (Render ephemeral FS)
        file_bytes = f.read()
        mime_type = f.content_type or f"image/{ext.lstrip('.')}"

        # Also save to disk as a cache
        uploads_dir = os.path.join(current_app.root_path, "uploads", "templates")
        os.makedirs(uploads_dir, exist_ok=True)
        unique_name = f"{uuid.uuid4().hex}{ext}"
        save_path = os.path.join(uploads_dir, unique_name)
        with open(save_path, "wb") as fp:
            fp.write(file_bytes)

        image_url = f"/uploads/templates/{unique_name}"

        # Stash bytes in app-level cache so create_template can persist to DB
        if not hasattr(current_app, '_upload_cache'):
            current_app._upload_cache = {}
        current_app._upload_cache[image_url] = (file_bytes, mime_type)

        return jsonify({"image_url": image_url}), 201
    except Exception as e:
        return jsonify({"error": "server_error", "detail": str(e)}), 500


@admin_templates_bp.post("/templates")
@_require_admin
def create_template():
    """
    POST /api/admin/templates
    Body: name, description?, category?, svg_content, thumbnail_url?, is_active?.
    Validates SVG and creates template + template_regions. Optionally generates thumbnail.
    """
    try:
        payload = request.get_json(silent=True)
        ok, data, err = validate_template_data(payload)
        if not ok:
            return jsonify({"error": "validation_error", "detail": err}), 400

        svg_content = data.get("svg_content")
        image_url = data.get("image_url")
        template_type = data.get("template_type", "svg")

        # One of svg_content OR image_url is required
        if not svg_content and not image_url:
            return jsonify({"error": "validation_error", "detail": "Either svg_content or image_url is required"}), 400

        regions = []
        if svg_content:
            regions, parse_err = parse_svg_regions(svg_content)
            if parse_err:
                return jsonify({"error": "validation_error", "detail": parse_err}), 400
            template_type = "svg"
        elif image_url:
            template_type = "image"

        # Retrieve cached image bytes (from upload-image endpoint)
        image_data = None
        image_mime = None
        if image_url and hasattr(current_app, '_upload_cache') and image_url in current_app._upload_cache:
            image_data, image_mime = current_app._upload_cache.pop(image_url)
        elif image_url and not image_url.startswith('http'):
            # Try reading from disk as fallback
            try:
                disk_path = os.path.join(current_app.root_path, image_url.lstrip('/'))
                if os.path.isfile(disk_path):
                    with open(disk_path, 'rb') as fp:
                        image_data = fp.read()
                    ext = os.path.splitext(disk_path)[1].lower().lstrip('.')
                    image_mime = f'image/{ext}' if ext else 'image/png'
            except Exception:
                pass

        template = Template(
            name=data["name"],
            description=data.get("description"),
            category=data.get("category"),
            difficulty=data.get("difficulty"),
            dimensions=data.get("dimensions"),
            piece_count=data.get("piece_count"),
            svg_content=svg_content or "",   # empty string for image-based (SQLite NOT NULL compat)
            image_url=image_url,
            image_data=image_data,
            image_mime=image_mime,
            template_type=template_type,
            default_design_data=data.get("default_design_data"),
            thumbnail_url=data.get("thumbnail_url"),
            is_active=data.get("is_active", True),
        )
        db.session.add(template)
        db.session.flush()

        for r in regions:
            db.session.add(TemplateRegion(
                template_id=template.id,
                region_id=r["region_id"],
                display_order=r["display_order"],
            ))
        db.session.commit()
        db.session.refresh(template)
        return jsonify(template.to_dict(include_regions=True, include_svg=True)), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "server_error", "detail": str(e)}), 500


@admin_templates_bp.put("/templates/<int:template_id>")
@_require_admin
def update_template(template_id):
    """
    PUT /api/admin/templates/<id>
    Body: name?, description?, category?, svg_content?, thumbnail_url?, is_active?.
    If svg_content is provided, regions are re-parsed and replaced.
    """
    try:
        template = Template.query.get(template_id)
        if not template:
            return jsonify({"error": "not_found", "detail": "Template not found"}), 404

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "validation_error", "detail": "Request body must be a JSON object"}), 400
        # Merge existing so partial payload validates
        merged = {
            "name": template.name,
            "description": template.description,
            "category": template.category,
            "image_url": template.image_url,
            "template_type": template.template_type,
            "default_design_data": template.default_design_data,
            "thumbnail_url": template.thumbnail_url,
            "is_active": template.is_active,
        }
        # Only include existing svg_content if it's non-empty (skip for image templates)
        if template.svg_content:
            merged["svg_content"] = template.svg_content
        merged.update({k: v for k, v in payload.items() if k in merged or k in ("is_active", "difficulty", "dimensions", "piece_count", "svg_content", "image_url", "default_design_data")})
        ok, data, err = validate_template_data(merged)
        if not ok:
            return jsonify({"error": "validation_error", "detail": err}), 400

        template.name = data["name"]
        template.description = data.get("description")
        template.category = data.get("category")
        template.difficulty = data.get("difficulty")
        template.dimensions = data.get("dimensions")
        if data.get("piece_count") is not None:
            template.piece_count = data["piece_count"]
        if "default_design_data" in data:
            template.default_design_data = data.get("default_design_data")
        template.thumbnail_url = data.get("thumbnail_url")
        template.is_active = data.get("is_active", True)

        # Update image_url if provided
        if data.get("image_url") is not None:
            template.image_url = data["image_url"]
            template.template_type = "image"

        if "svg_content" in data and data["svg_content"]:
            svg_content = data["svg_content"]
            regions, parse_err = parse_svg_regions(svg_content)
            if parse_err:
                return jsonify({"error": "validation_error", "detail": parse_err}), 400
            template.svg_content = svg_content
            template.template_type = "svg"
            TemplateRegion.query.filter(TemplateRegion.template_id == template_id).delete()
            for r in regions:
                db.session.add(TemplateRegion(
                    template_id=template_id,
                    region_id=r["region_id"],
                    display_order=r["display_order"],
                ))
        db.session.commit()
        db.session.refresh(template)
        return jsonify(template.to_dict(include_regions=True, include_svg=True))
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "server_error", "detail": str(e)}), 500


@admin_templates_bp.delete("/templates/<int:template_id>")
@_require_admin
def delete_template(template_id):
    """
    DELETE /api/admin/templates/<id>
    If ?hard=true is passed, permanently deletes the template from the database.
    Otherwise, soft delete: sets is_active=False.
    """
    try:
        template = Template.query.get(template_id)
        if not template:
            return jsonify({"error": "not_found", "detail": "Template not found"}), 404

        hard = request.args.get("hard", "").lower() in ("true", "1", "yes")
        if hard:
            db.session.delete(template)
            db.session.commit()
            return jsonify({"success": True, "message": "Template permanently deleted"}), 200

        template.is_active = False
        db.session.commit()
        return jsonify({"success": True, "message": "Template deactivated"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "server_error", "detail": str(e)}), 500
