import json
import os

from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash

from .auth import create_token, require_auth
from .db import fetch_item, fetch_items, init_db, upsert_item
from .etsy import extract_listing_id, fetch_listing


api = Blueprint("api", __name__)


@api.get("/health")
def health():
    return {
        "status": "ok",
        "config": {
            "etsy_api_configured": bool(os.environ.get("ETSY_API_KEY") and os.environ.get("ETSY_SHARED_SECRET")),
            "jwt_configured": bool(os.environ.get("JWT_SECRET")),
            "admin_configured": bool(os.environ.get("ADMIN_EMAIL") and os.environ.get("ADMIN_PASSWORD_HASH")),
        }
    }


@api.post("/auth/login")
def login():
    payload = request.get_json(silent=True) or {}
    email = payload.get("email", "").strip().lower()
    password = payload.get("password", "")

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").strip().lower()
    admin_hash = os.environ.get("ADMIN_PASSWORD_HASH")
    if not admin_hash:
        return jsonify({"error": "admin_not_configured"}), 500

    if email != admin_email or not check_password_hash(admin_hash, password):
        return jsonify({"error": "invalid_credentials"}), 401

    token = create_token(email)
    return jsonify({"token": token})


@api.get("/items")
def list_items():
    init_db()
    return jsonify(fetch_items())


@api.get("/items/<int:item_id>")
def get_item(item_id):
    init_db()
    item = fetch_item(item_id)
    if not item:
        return jsonify({"error": "not_found"}), 404
    return jsonify(item)


@api.post("/items")
@require_auth
def create_item():
    init_db()
    payload = request.get_json(silent=True) or {}
    if not payload:
        payload = request.form.to_dict() or {}
    if not payload:
        raw_body = request.get_data(as_text=True) or ""
        try:
            payload = json.loads(raw_body) if raw_body else {}
        except json.JSONDecodeError:
            payload = {}

    listing_value = (
        payload.get("etsy_listing_id")
        or payload.get("etsy_url")
        or payload.get("listing_value")
        or payload.get("listing_id")
        or payload.get("listingId")
        or request.args.get("etsy_listing_id")
        or request.args.get("etsy_url")
        or request.args.get("listing_id")
    )
    listing_id = extract_listing_id(listing_value)
    if not listing_id:
        return jsonify({
            "error": "missing_listing_id",
            "detail": "Provide an Etsy listing URL or numeric listing ID.",
        }), 400

    try:
        listing = fetch_listing(listing_id)
    except RuntimeError as exc:
        message = str(exc)
        if message.startswith("etsy_api_error:"):
            parts = message.split(":", 2)
            status = parts[1] if len(parts) > 1 else ""
            detail = parts[2] if len(parts) > 2 else ""
            return jsonify({
                "error": "etsy_api_error",
                "status": status,
                "detail": detail or "Etsy API request failed.",
            }), 502
        return jsonify({"error": message}), 502

    item_id = upsert_item(listing)
    item = fetch_item(item_id) or listing
    return jsonify(item), 201
