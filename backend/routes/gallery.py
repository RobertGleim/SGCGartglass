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
MAX_PHOTOS_PER_SUBMISSION = 10
MAX_SINGLE_PHOTO_BYTES = 20 * 1024 * 1024
MAX_TOTAL_PHOTO_BYTES = 120 * 1024 * 1024


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


def _normalize_display_name(value):
    normalized = (value or "").strip()
    if not normalized:
        return None
    return normalized[:120]


def _get_public_base_url():
    forwarded_proto = (request.headers.get("X-Forwarded-Proto") or "").strip()
    forwarded_host = (request.headers.get("X-Forwarded-Host") or "").strip()
    if forwarded_proto and forwarded_host:
        return f"{forwarded_proto}://{forwarded_host}".rstrip("/")
    return request.url_root.rstrip("/")


def _with_absolute_image_url(item):
    output = dict(item)
    image_url = output.get("image_url")
    if image_url and isinstance(image_url, str) and image_url.startswith("/"):
        output["image_url"] = f"{_get_public_base_url()}{image_url}"
    return output


def _serialize_list(query, include_admin_fields=False):
    items = query.order_by(GalleryPhoto.created_at.desc(), GalleryPhoto.id.desc()).all()
    categories = sorted({item.category for item in items if item.category})
    templates = sorted(
        {item.template for item in items if item.template_id and item.template},
        key=lambda template: template.name.lower(),
    )
    return {
        "items": [_with_absolute_image_url(item.to_dict(include_admin_fields=include_admin_fields)) for item in items],
        "categories": categories,
        "templates": [{"id": template.id, "name": template.name} for template in templates],
    }


@gallery_bp.get("/gallery/photos")
def list_gallery_photos():
    category = (request.args.get("category") or "").strip()
    template_id = request.args.get("template_id", type=int)
    photo_id = request.args.get("photo_id", type=int)

    query = GalleryPhoto.query.filter(
        GalleryPhoto.is_hidden.is_(False),
        GalleryPhoto.approval_status == "approved",
    )
    if category:
        query = query.filter(GalleryPhoto.category.ilike(category))
    if template_id:
        query = query.filter(GalleryPhoto.template_id == template_id)
    if photo_id:
        anchor = query.filter(GalleryPhoto.id == photo_id).first()
        if anchor:
            group_id = anchor.submission_group_id or str(anchor.id)
            query = query.filter(GalleryPhoto.submission_group_id == group_id)
        else:
            query = query.filter(GalleryPhoto.id == photo_id)

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
    display_name = _normalize_display_name(request.form.get("display_name"))
    hide_submitter_name = str(request.form.get("hide_submitter_name") or "").strip().lower() in {"1", "true", "yes", "on"}
    template_id = request.form.get("template_id", type=int)

    if not panel_name:
        return jsonify({"error": "validation_error", "detail": "Panel name is required."}), 400
    if len(panel_name) > 255:
        return jsonify({"error": "validation_error", "detail": "Panel name must be 255 characters or fewer."}), 400
    valid_files = [file for file in files if file and file.filename]
    if not valid_files:
        return jsonify({"error": "validation_error", "detail": "At least one photo file is required."}), 400
    if len(valid_files) > MAX_PHOTOS_PER_SUBMISSION:
        return jsonify({
            "error": "validation_error",
            "detail": f"You can upload up to {MAX_PHOTOS_PER_SUBMISSION} photos per submission. Please reduce the number of photos.",
        }), 400

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

    if not display_name:
        if role == "customer":
            email = str(payload.get("sub") or "")
            guessed = email.split("@", 1)[0].replace(".", " ").replace("_", " ").strip()
            display_name = guessed[:120] if guessed else "Customer"
        else:
            display_name = "SGCG Art"

    submission_group_id = uuid.uuid4().hex
    created_photos = []
    total_bytes = 0
    for index, file in enumerate(valid_files):
        original_name = secure_filename(file.filename)
        ext = os.path.splitext(original_name)[1].lower()
        mime_type = (file.content_type or "").lower()
        if ext not in ALLOWED_EXTENSIONS or (mime_type and mime_type not in ALLOWED_MIME):
            return jsonify({"error": "validation_error", "detail": f"Unsupported image type: {ext or 'unknown'}"}), 400

        file_bytes = file.read()
        file_size = len(file_bytes)
        if file_size > MAX_SINGLE_PHOTO_BYTES:
            return jsonify({
                "error": "validation_error",
                "detail": f"{original_name or 'A photo'} is too large to upload. Please use a smaller file.",
            }), 400
        total_bytes += file_size
        if total_bytes > MAX_TOTAL_PHOTO_BYTES:
            return jsonify({
                "error": "validation_error",
                "detail": "This upload is too large to process. Please reduce the number of photos or file sizes.",
            }), 400

        unique_name = f"{uuid.uuid4().hex}{ext}"
        saved_path = os.path.join(uploads_dir, unique_name)
        with open(saved_path, "wb") as output:
            output.write(file_bytes)

        photo = GalleryPhoto(
            panel_name=panel_name,
            description=description,
            category=category,
            submission_group_id=submission_group_id,
            is_cover=(index == 0),
            display_name=display_name,
            hide_submitter_name=hide_submitter_name,
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
        "items": [_with_absolute_image_url(photo.to_dict(include_admin_fields=True)) for photo in created_photos],
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

    original_group_id = photo.submission_group_id or str(photo.id)

    def _ensure_group_has_cover(group_id):
        if not group_id:
            return
        has_cover = GalleryPhoto.query.filter(
            GalleryPhoto.submission_group_id == group_id,
            GalleryPhoto.is_cover.is_(True),
        ).first()
        if has_cover:
            return
        fallback = GalleryPhoto.query.filter(
            GalleryPhoto.submission_group_id == group_id,
        ).order_by(GalleryPhoto.created_at.asc(), GalleryPhoto.id.asc()).first()
        if fallback:
            fallback.is_cover = True

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
    if "submission_group_id" in payload:
        group_id = str(payload.get("submission_group_id") or "").strip()
        if not group_id:
            return jsonify({"error": "validation_error", "detail": "submission_group_id cannot be empty."}), 400
        photo.submission_group_id = group_id[:64]
    if "display_name" in payload:
        photo.display_name = _normalize_display_name(payload.get("display_name"))
    if "hide_submitter_name" in payload:
        photo.hide_submitter_name = bool(payload.get("hide_submitter_name"))
    if "is_cover" in payload:
        is_cover = bool(payload.get("is_cover"))
        if is_cover:
            group_id = photo.submission_group_id or str(photo.id)
            GalleryPhoto.query.filter(
                GalleryPhoto.submission_group_id == group_id,
                GalleryPhoto.id != photo.id,
            ).update({"is_cover": False}, synchronize_session=False)
        photo.is_cover = is_cover

    current_group_id = photo.submission_group_id or str(photo.id)
    _ensure_group_has_cover(current_group_id)
    if original_group_id != current_group_id:
        _ensure_group_has_cover(original_group_id)

    db.session.commit()
    return jsonify(_with_absolute_image_url(photo.to_dict(include_admin_fields=True)))


@admin_gallery_bp.delete("/gallery/photos/<int:photo_id>")
def admin_delete_gallery_photo(photo_id):
    _, auth_error = _require_admin()
    if auth_error:
        return auth_error

    photo = GalleryPhoto.query.get(photo_id)
    if not photo:
        return jsonify({"error": "not_found"}), 404

    was_cover = bool(photo.is_cover)
    group_id = photo.submission_group_id or str(photo.id)

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

    if was_cover:
        replacement = GalleryPhoto.query.filter(
            GalleryPhoto.submission_group_id == group_id,
        ).order_by(GalleryPhoto.created_at.asc(), GalleryPhoto.id.asc()).first()
        if replacement and not replacement.is_cover:
            replacement.is_cover = True
            db.session.commit()

    return jsonify({"success": True})
