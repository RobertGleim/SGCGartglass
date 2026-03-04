"""Photo gallery API routes."""
import os
import uuid

from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename

from ..auth import decode_token
from ..models import db, GalleryPhoto, Template

gallery_bp = Blueprint("gallery", __name__)
admin_gallery_bp = Blueprint("admin_gallery", __name__)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _extract_payload_from_request():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None, "missing_token"
    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None, "missing_token"
    try:
        payload = decode_token(token)
        return payload, None
    except Exception:
        return None, "invalid_token"


def _require_signed_in():
    payload, err = _extract_payload_from_request()
    if err:
        return None, (jsonify({"error": err}), 401)
    return payload, None


def _require_admin():
    payload, err = _extract_payload_from_request()
    if err:
        return None, (jsonify({"error": err}), 401)
    if payload.get("role") == "customer":
        return None, (jsonify({"error": "forbidden"}), 403)
    return payload, None


def _normalize_category(value):
    normalized = (value or "").strip()
    return normalized[:100] if normalized else None


def _normalize_description(value):
    normalized = (value or "").strip()
    if not normalized:
        return None
    return normalized[:200]


def _serialize_list(query, include_admin_fields=False):
    items = query.order_by(GalleryPhoto.created_at.desc(), GalleryPhoto.id.desc()).all()
    categories = sorted({item.category for item in items if item.category})
    templates = sorted(
        {item.template for item in items if item.template_id and item.template},
        key=lambda template: template.name.lower(),
    )
    return {
        "items": [item.to_dict(include_admin_fields=include_admin_fields) for item in items],
        "categories": categories,
        "templates": [{"id": template.id, "name": template.name} for template in templates],
    }


@gallery_bp.get("/gallery/photos")
def list_gallery_photos():
    category = (request.args.get("category") or "").strip()
    template_id = request.args.get("template_id", type=int)

    query = GalleryPhoto.query.filter(
        GalleryPhoto.is_hidden.is_(False),
        GalleryPhoto.approval_status == "approved",
    )
    if category:
        query = query.filter(GalleryPhoto.category.ilike(category))
    if template_id:
        query = query.filter(GalleryPhoto.template_id == template_id)

    return jsonify(_serialize_list(query, include_admin_fields=False))


@gallery_bp.post("/gallery/photos")
def create_gallery_photo():
    payload, auth_error = _require_signed_in()
    if auth_error:
        return auth_error

    files = request.files.getlist("photos")
    if not files:
        single = request.files.get("photo")
        files = [single] if single else []
    panel_name = (request.form.get("panel_name") or "").strip()
    description = _normalize_description(request.form.get("description"))
    category = _normalize_category(request.form.get("category"))
    template_id = request.form.get("template_id", type=int)

    if not panel_name:
        return jsonify({"error": "validation_error", "detail": "Panel name is required."}), 400
    if len(panel_name) > 255:
        return jsonify({"error": "validation_error", "detail": "Panel name must be 255 characters or fewer."}), 400
    valid_files = [file for file in files if file and file.filename]
    if not valid_files:
        return jsonify({"error": "validation_error", "detail": "At least one photo file is required."}), 400
    if len(valid_files) > 5:
        return jsonify({"error": "validation_error", "detail": "You can upload up to 5 photos per submission."}), 400

    if template_id:
        exists = Template.query.filter(Template.id == template_id).first()
        if not exists:
            return jsonify({"error": "validation_error", "detail": "Template not found."}), 400

    uploads_dir = os.path.join(os.path.dirname(__file__), "..", "uploads", "gallery")
    uploads_dir = os.path.abspath(uploads_dir)
    os.makedirs(uploads_dir, exist_ok=True)

    role = payload.get("role") or "admin"
    approval_status = "pending" if role == "customer" else "approved"
    created_by = payload.get("sub") or str(payload.get("customer_id") or "")

    submission_group_id = uuid.uuid4().hex
    created_photos = []
    for file in valid_files:
        original_name = secure_filename(file.filename)
        ext = os.path.splitext(original_name)[1].lower()
        mime_type = (file.content_type or "").lower()
        if ext not in ALLOWED_EXTENSIONS or (mime_type and mime_type not in ALLOWED_MIME):
            return jsonify({"error": "validation_error", "detail": f"Unsupported image type: {ext or 'unknown'}"}), 400

        file_bytes = file.read()
        unique_name = f"{uuid.uuid4().hex}{ext}"
        saved_path = os.path.join(uploads_dir, unique_name)
        with open(saved_path, "wb") as output:
            output.write(file_bytes)

        photo = GalleryPhoto(
            panel_name=panel_name,
            description=description,
            category=category,
            submission_group_id=submission_group_id,
            image_url=f"/uploads/gallery/{unique_name}",
            image_data=file_bytes,
            image_mime=mime_type,
            template_id=template_id,
            show_description=True,
            is_hidden=False,
            approval_status=approval_status,
            created_by_role=role,
            created_by_id=created_by,
        )
        db.session.add(photo)
        created_photos.append(photo)

    db.session.commit()
    return jsonify({
        "submission_group_id": submission_group_id,
        "items": [photo.to_dict(include_admin_fields=True) for photo in created_photos],
    }), 201


@admin_gallery_bp.get("/gallery/photos")
def admin_list_gallery_photos():
    _, auth_error = _require_admin()
    if auth_error:
        return auth_error

    approval_status = (request.args.get("approval_status") or "").strip().lower()
    category = (request.args.get("category") or "").strip()
    template_id = request.args.get("template_id", type=int)
    query = GalleryPhoto.query
    if approval_status in {"pending", "approved", "rejected"}:
        query = query.filter(GalleryPhoto.approval_status == approval_status)
    if category:
        query = query.filter(GalleryPhoto.category.ilike(category))
    if template_id:
        query = query.filter(GalleryPhoto.template_id == template_id)
    return jsonify(_serialize_list(query, include_admin_fields=True))


@admin_gallery_bp.put("/gallery/photos/<int:photo_id>")
def admin_update_gallery_photo(photo_id):
    _, auth_error = _require_admin()
    if auth_error:
        return auth_error

    payload = request.get_json(silent=True) or {}
    photo = GalleryPhoto.query.get(photo_id)
    if not photo:
        return jsonify({"error": "not_found"}), 404

    if "panel_name" in payload:
        panel_name = (payload.get("panel_name") or "").strip()
        if not panel_name:
            return jsonify({"error": "validation_error", "detail": "Panel name is required."}), 400
        photo.panel_name = panel_name[:255]

    if "description" in payload:
        photo.description = _normalize_description(payload.get("description"))
    if "category" in payload:
        photo.category = _normalize_category(payload.get("category"))
    if "show_description" in payload:
        photo.show_description = bool(payload.get("show_description"))
    if "is_hidden" in payload:
        photo.is_hidden = bool(payload.get("is_hidden"))
    if "approval_status" in payload:
        next_status = str(payload.get("approval_status") or "").strip().lower()
        if next_status not in {"pending", "approved", "rejected"}:
            return jsonify({"error": "validation_error", "detail": "Invalid approval_status."}), 400
        photo.approval_status = next_status
    if "template_id" in payload:
        template_id = payload.get("template_id")
        if template_id in (None, ""):
            photo.template_id = None
        else:
            template = Template.query.filter(Template.id == int(template_id)).first()
            if not template:
                return jsonify({"error": "validation_error", "detail": "Template not found."}), 400
            photo.template_id = template.id

    db.session.commit()
    return jsonify(photo.to_dict(include_admin_fields=True))


@admin_gallery_bp.delete("/gallery/photos/<int:photo_id>")
def admin_delete_gallery_photo(photo_id):
    _, auth_error = _require_admin()
    if auth_error:
        return auth_error

    photo = GalleryPhoto.query.get(photo_id)
    if not photo:
        return jsonify({"error": "not_found"}), 404

    if photo.image_url:
        disk_path = os.path.join(os.path.dirname(__file__), "..", photo.image_url.lstrip("/"))
        disk_path = os.path.abspath(disk_path)
        if os.path.isfile(disk_path):
            try:
                os.remove(disk_path)
            except OSError:
                pass

    db.session.delete(photo)
    db.session.commit()
    return jsonify({"success": True})
