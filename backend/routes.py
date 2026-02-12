import os

from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash

from .auth import create_token, require_auth
from .db import fetch_item, fetch_items, init_db, upsert_item
from .etsy import extract_listing_id, fetch_listing


api = Blueprint("api", __name__)


@api.get("/health")
def health():
    return {"status": "ok"}


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
    listing_value = payload.get("etsy_listing_id") or payload.get("etsy_url")
    listing_id = extract_listing_id(listing_value)
    if not listing_id:
        return jsonify({"error": "missing_listing_id"}), 400

    try:
        listing = fetch_listing(listing_id)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 502

    item_id = upsert_item(listing)
    item = fetch_item(item_id) or listing
    return jsonify(item), 201
