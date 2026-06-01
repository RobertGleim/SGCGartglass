"""
Shared pattern download response helpers.
"""
import base64
import mimetypes
import os
from io import BytesIO
from urllib.parse import unquote_to_bytes

from flask import current_app, jsonify, send_file
from werkzeug.utils import secure_filename

from .pattern_render_service import render_numbered_pattern_raster


def _resolve_pattern_image_bytes(record):
    image_data = record.get("image_data")
    if image_data:
        if isinstance(image_data, memoryview):
            image_data = image_data.tobytes()
        return image_data

    image_url = str(record.get("image_url") or "").strip()
    if not image_url:
        return None

    if image_url.startswith("data:"):
        try:
            header, encoded = image_url.split(",", 1)
            if ";base64" in header:
                return base64.b64decode(encoded)
            return unquote_to_bytes(encoded)
        except Exception:
            current_app.logger.exception(
                "failed to decode data-url pattern image for token %s",
                record.get("download_token") or "runtime",
            )
            return None

    if image_url.startswith("/uploads/"):
        relative_path = image_url.lstrip("/").replace("/", os.sep)
        file_path = os.path.join(current_app.root_path, relative_path)
        if os.path.isfile(file_path):
            try:
                with open(file_path, "rb") as handle:
                    return handle.read()
            except OSError:
                current_app.logger.exception("failed to read pattern image file %s", file_path)
    return None


def build_pattern_download_response(record, download_token=None):
    if not record:
        return jsonify({"error": "download_unavailable"}), 404

    safe_base = secure_filename(str(record.get("pattern_name") or "sgcg-pattern").strip()) or "sgcg-pattern"

    svg_content = record.get("svg_content")
    if svg_content:
        return send_file(
            BytesIO(svg_content.encode("utf-8")),
            mimetype="image/svg+xml",
            as_attachment=True,
            download_name=f"{safe_base}.svg",
        )

    if str(record.get("template_type") or "").strip().lower() == "image":
        numbered_bytes = render_numbered_pattern_raster(
            _resolve_pattern_image_bytes({**record, "download_token": download_token})
        )
        if numbered_bytes:
            return send_file(
                BytesIO(numbered_bytes),
                mimetype="image/png",
                as_attachment=True,
                download_name=f"{safe_base}.png",
            )

    image_data = record.get("image_data")
    if image_data:
        if isinstance(image_data, memoryview):
            image_data = image_data.tobytes()
        mime_type = record.get("image_mime") or "application/octet-stream"
        extension = mimetypes.guess_extension(mime_type) or ".bin"
        if extension == ".jpe":
            extension = ".jpg"
        return send_file(
            BytesIO(image_data),
            mimetype=mime_type,
            as_attachment=True,
            download_name=f"{safe_base}{extension}",
        )

    image_url = str(record.get("image_url") or "").strip()
    if image_url.startswith("data:"):
        try:
            header, encoded = image_url.split(",", 1)
            mime_type = header[5:].split(";", 1)[0] or "application/octet-stream"
            if ";base64" in header:
                raw_bytes = base64.b64decode(encoded)
            else:
                raw_bytes = unquote_to_bytes(encoded)
            extension = mimetypes.guess_extension(mime_type) or ".bin"
            if extension == ".jpe":
                extension = ".jpg"
            return send_file(
                BytesIO(raw_bytes),
                mimetype=mime_type,
                as_attachment=True,
                download_name=f"{safe_base}{extension}",
            )
        except Exception:
            current_app.logger.exception(
                "failed to decode data-url pattern download for token %s",
                download_token or "admin",
            )

    if image_url.startswith("/uploads/templates/"):
        file_name = image_url.rsplit("/", 1)[-1]
        uploads_dir = os.path.join(current_app.root_path, "uploads", "templates")
        file_path = os.path.join(uploads_dir, file_name)
        if os.path.isfile(file_path):
            mime_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
            extension = os.path.splitext(file_path)[1] or ".bin"
            return send_file(
                file_path,
                mimetype=mime_type,
                as_attachment=True,
                download_name=f"{safe_base}{extension}",
            )

    if image_url.startswith("/uploads/"):
        relative_path = image_url.lstrip("/").replace("/", os.sep)
        file_path = os.path.join(current_app.root_path, relative_path)
        if os.path.isfile(file_path):
            mime_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
            extension = os.path.splitext(file_path)[1] or ".bin"
            return send_file(
                file_path,
                mimetype=mime_type,
                as_attachment=True,
                download_name=f"{safe_base}{extension}",
            )

    return jsonify({"error": "download_unavailable"}), 404
