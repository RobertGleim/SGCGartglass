"""
Glass type API: public list (active only) and admin CRUD + toggle + reorder.
"""
import os
from flask import Blueprint, jsonify, request, current_app
from pathlib import Path
from sqlalchemy import func

from ..models import db, GlassType
from ..services.glass_type_service import (
    validate_texture_image,
    save_texture_file,
    validate_glass_type_data,
    validate_reorder_data,
)

glass_types_bp = Blueprint("glass_types", __name__)
admin_glass_types_bp = Blueprint("admin_glass_types", __name__)


def _require_admin(handler):
    """Placeholder: require admin auth. Integrate with require_auth + role check later."""
    return handler


def _upload_folder() -> str:
    """Base upload directory; textures stored in <upload_folder>/textures/."""
    folder = current_app.config.get("UPLOAD_FOLDER")
    if folder:
        return folder
    return str(Path(current_app.root_path) / "uploads")


@glass_types_bp.get("/glass-types")
def list_glass_types():
    """
    GET /api/glass-types
    Returns only active glass types, ordered by display_order then id.
    """
    try:
        items = (
            GlassType.query.filter(GlassType.is_active.is_(True))
            .order_by(GlassType.display_order.asc(), GlassType.id.asc())
            .all()
        )
        return jsonify({"items": [g.to_dict() for g in items]})
    except Exception as e:
        return jsonify({"error": "server_error", "detail": str(e)}), 500


@admin_glass_types_bp.get("/glass-types")
@_require_admin
def admin_list_glass_types():
    """
    GET /api/admin/glass-types
    Returns all glass types (active and inactive), ordered by display_order then id.
    """
    try:
        items = (
            GlassType.query.order_by(GlassType.display_order.asc(), GlassType.id.asc())
            .all()
        )
        return jsonify({"items": [g.to_dict() for g in items]})
    except Exception as e:
        return jsonify({"error": "server_error", "detail": str(e)}), 500


@admin_glass_types_bp.post("/glass-types")
@_require_admin
def create_glass_type():
    """
    POST /api/admin/glass-types
    Body: JSON with name, description?, texture_url?, is_active?, display_order?
    Or multipart/form-data: same fields + optional file "texture" (PNG/JPG 256x256, max 1MB).
    If file is provided and valid, texture_url is set from saved file.
    """
    try:
        payload = None
        file = None
        if request.is_json:
            payload = request.get_json(silent=True)
        else:
            payload = request.form.to_dict() or {}
            file = request.files.get("texture") or request.files.get("texture_image")

        ok, data, err = validate_glass_type_data(payload, for_update=False)
        if not ok:
            return jsonify({"error": "validation_error", "detail": err}), 400

        texture_url = data.get("texture_url")
        if file and file.filename:
            valid, msg = validate_texture_image(file)
            if not valid:
                return jsonify({"error": "validation_error", "detail": msg}), 400
            url_path, save_err = save_texture_file(file, _upload_folder())
            if save_err:
                return jsonify({"error": "server_error", "detail": save_err}), 500
            texture_url = url_path

        max_order = db.session.query(func.max(GlassType.display_order)).scalar()
        next_order = (max_order if max_order is not None else -1) + 1
        glass_type = GlassType(
            name=data["name"],
            description=data.get("description"),
            texture_url=texture_url or data.get("texture_url"),
            is_active=data.get("is_active", True),
            display_order=data.get("display_order", next_order),
        )
        db.session.add(glass_type)
        db.session.commit()
        db.session.refresh(glass_type)
        return jsonify(glass_type.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "server_error", "detail": str(e)}), 500


@admin_glass_types_bp.put("/glass-types/<int:glass_type_id>")
@_require_admin
def update_glass_type(glass_type_id):
    """
    PUT /api/admin/glass-types/<id>
    Body: JSON with name?, description?, texture_url?, is_active?, display_order?
    Or multipart/form-data with optional file "texture". If file provided, texture_url is updated.
    """
    try:
        glass_type = GlassType.query.get(glass_type_id)
        if not glass_type:
            return jsonify({"error": "not_found", "detail": "Glass type not found"}), 404

        payload = None
        file = None
        if request.is_json:
            payload = request.get_json(silent=True)
        else:
            payload = request.form.to_dict() or {}
            file = request.files.get("texture") or request.files.get("texture_image")

        ok, data, err = validate_glass_type_data(payload, for_update=True)
        if not ok:
            return jsonify({"error": "validation_error", "detail": err}), 400

        if file and file.filename:
            valid, msg = validate_texture_image(file)
            if not valid:
                return jsonify({"error": "validation_error", "detail": msg}), 400
            url_path, save_err = save_texture_file(file, _upload_folder())
            if save_err:
                return jsonify({"error": "server_error", "detail": save_err}), 500
            data["texture_url"] = url_path

        for key, value in data.items():
            if hasattr(glass_type, key):
                setattr(glass_type, key, value)
        db.session.commit()
        db.session.refresh(glass_type)
        return jsonify(glass_type.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "server_error", "detail": str(e)}), 500


@admin_glass_types_bp.put("/glass-types/<int:glass_type_id>/toggle")
@_require_admin
def toggle_glass_type(glass_type_id):
    """
    PUT /api/admin/glass-types/<id>/toggle
    Flips is_active (activate/deactivate). Returns updated glass type.
    """
    try:
        glass_type = GlassType.query.get(glass_type_id)
        if not glass_type:
            return jsonify({"error": "not_found", "detail": "Glass type not found"}), 404
        glass_type.is_active = not glass_type.is_active
        db.session.commit()
        db.session.refresh(glass_type)
        return jsonify(glass_type.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "server_error", "detail": str(e)}), 500


@admin_glass_types_bp.put("/glass-types/reorder")
@_require_admin
def reorder_glass_types():
    """
    PUT /api/admin/glass-types/reorder
    Body: { "items": [ { "id": 1, "display_order": 0 }, ... ] } or array directly.
    Updates display_order for each given id (drag-to-reorder).
    """
    try:
        payload = request.get_json(silent=True)
        if payload is None and request.get_data():
            return jsonify({"error": "validation_error", "detail": "Request body must be JSON"}), 400
        ok, items, err = validate_reorder_data(payload)
        if not ok:
            return jsonify({"error": "validation_error", "detail": err}), 400
        for row in items:
            gt = GlassType.query.get(row["id"])
            if gt:
                gt.display_order = row["display_order"]
        db.session.commit()
        # Return full list in new order
        updated = (
            GlassType.query.order_by(GlassType.display_order.asc(), GlassType.id.asc())
            .all()
        )
        return jsonify({"items": [g.to_dict() for g in updated]})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "server_error", "detail": str(e)}), 500
