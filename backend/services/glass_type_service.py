"""
Glass type business logic: texture image validation and file storage.
"""
import secrets
from pathlib import Path
from typing import Any, Optional, Tuple

# Allowed texture image constraints
ALLOWED_EXTENSIONS = frozenset({"png", "jpg", "jpeg"})
ALLOWED_MIME = frozenset({"image/png", "image/jpeg"})
MAX_SIZE_BYTES = 1 * 1024 * 1024  # 1 MB
REQUIRED_WIDTH = 256
REQUIRED_HEIGHT = 256


def _get_file_extension(filename: str) -> str:
    """Return lowercase extension without dot."""
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


def validate_texture_image(file: Any) -> Tuple[bool, str]:
    """
    Validate texture image: PNG or JPG, 256x256px, max 1MB.
    file: Werkzeug FileStorage or object with .read(), .filename, .content_type.
    Returns (ok: bool, error_message: str).
    """
    if file is None:
        return False, "No file provided"
    if not hasattr(file, "read") or not callable(getattr(file, "read")):
        return False, "Invalid file object"
    filename = getattr(file, "filename", None) or ""
    ext = _get_file_extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"Allowed formats: PNG, JPG. Got: {ext or 'unknown'}"
    content_type = getattr(file, "content_type", "") or ""
    if content_type and content_type.lower() not in ALLOWED_MIME:
        return False, f"Allowed MIME: image/png, image/jpeg. Got: {content_type}"

    try:
        data = file.read()
    except OSError as e:
        return False, f"Cannot read file: {e}"
    if not data:
        return False, "File is empty"
    if len(data) > MAX_SIZE_BYTES:
        return False, f"File size must be at most 1 MB (got {len(data) / (1024 * 1024):.2f} MB)"

    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(data))
    except ImportError:
        # Pillow not installed: skip dimension check
        return True, ""
    except Exception as e:
        return False, f"Invalid image: {e}"

    width, height = img.size
    if width != REQUIRED_WIDTH or height != REQUIRED_HEIGHT:
        return False, f"Image must be exactly {REQUIRED_WIDTH}x{REQUIRED_HEIGHT} px (got {width}x{height})"
    return True, ""


def save_texture_file(file: Any, upload_folder: str) -> Tuple[Optional[str], str]:
    """
    Save texture file to uploads/textures/ with a unique name.
    file: Werkzeug FileStorage or object with .read(), .filename.
    upload_folder: base directory (e.g. app.config["UPLOAD_FOLDER"]); textures go in upload_folder/textures/.
    Returns (url_path: str or None, error_message: str).
    url_path is relative for use in API (e.g. /uploads/textures/abc123.png).
    """
    if file is None or not hasattr(file, "read"):
        return None, "No file provided"
    filename = getattr(file, "filename", None) or "texture"
    ext = _get_file_extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        ext = "png"
    safe_name = f"{secrets.token_hex(8)}.{ext}"
    textures_dir = Path(upload_folder) / "textures"
    try:
        textures_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        return None, f"Cannot create upload directory: {e}"

    dest = textures_dir / safe_name
    try:
        file.seek(0)
        data = file.read()
        if not data:
            return None, "File is empty"
        dest.write_bytes(data)
    except OSError as e:
        return None, f"Cannot save file: {e}"

    # Return URL path that the app will serve (e.g. /uploads/textures/xxx.png)
    return f"/uploads/textures/{safe_name}", ""


def validate_glass_type_data(data: Any, for_update: bool = False) -> Tuple[bool, dict, str]:
    """
    Validate glass type create/update payload (name, description, texture_url, is_active, display_order).
    for_update: if True, all fields are optional (partial update).
    Returns (ok, normalized_data, error_message).
    """
    if data is None:
        return False, {}, "Request body is required"
    if not isinstance(data, dict):
        return False, {}, "Request body must be a JSON object"

    name = (data.get("name") or "").strip() if data.get("name") is not None else None
    if not for_update and not name:
        return False, {}, "name is required"
    if name is not None and len(name) > 100:
        return False, {}, "name must be at most 100 characters"

    description = data.get("description")
    if description is not None:
        if not isinstance(description, str):
            description = str(description)
        description = description.strip() or None

    texture_url = data.get("texture_url")
    if texture_url is not None:
        if not isinstance(texture_url, str):
            return False, {}, "texture_url must be a string"
        texture_url = texture_url.strip() or None
        if texture_url and len(texture_url) > 500:
            return False, {}, "texture_url must be at most 500 characters"

    is_active = data.get("is_active")
    if is_active is not None:
        if isinstance(is_active, bool):
            pass
        elif isinstance(is_active, str):
            is_active = is_active.strip().lower() in ("1", "true", "yes")
        else:
            is_active = bool(is_active)

    display_order = data.get("display_order")
    if display_order is not None:
        try:
            display_order = int(display_order)
        except (TypeError, ValueError):
            return False, {}, "display_order must be an integer"

    out = {}
    if name is not None:
        out["name"] = name
    if description is not None:
        out["description"] = description
    if texture_url is not None:
        out["texture_url"] = texture_url
    if is_active is not None:
        out["is_active"] = is_active
    if display_order is not None:
        out["display_order"] = display_order
    return True, out, ""


def validate_reorder_data(data: Any) -> Tuple[bool, list, str]:
    """
    Validate reorder payload: array of {id: int, display_order: int}.
    Accepts either { "items": [...] } or [ ... ] directly.
    Returns (ok, list of {id, display_order}, error_message).
    """
    if data is None:
        return False, [], "Request body is required"
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = data.get("items", data.get("order"))
        if items is None:
            return False, [], "Expected 'items' array or root array of {id, display_order}"
    else:
        return False, [], "Request body must be a JSON object or array"
    if not isinstance(items, list):
        return False, [], "Expected array of {id, display_order}"
    result = []
    for i, row in enumerate(items):
        if not isinstance(row, dict):
            return False, [], f"Item at index {i} must be an object with id and display_order"
        try:
            row_id = int(row.get("id"))
            order = int(row.get("display_order", 0))
        except (TypeError, ValueError):
            return False, [], f"Item at index {i}: id and display_order must be integers"
        result.append({"id": row_id, "display_order": order})
    return True, result, ""
