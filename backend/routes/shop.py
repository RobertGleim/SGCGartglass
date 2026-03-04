
# ...existing code...

"""
Legacy shop API: auth, customer, items, manual products, etc.
Loaded as backend.routes.shop; api blueprint is re-exported from backend.routes.
"""
import json
import os
import hashlib
import secrets
from datetime import datetime, timedelta
from urllib.parse import quote

from flask import Blueprint, jsonify, request, g, current_app
from werkzeug.security import check_password_hash, generate_password_hash

from ..auth import create_token, require_auth, require_customer
from ..db import (
    fetch_item,
    fetch_items,
    init_db,
    upsert_item,
    create_manual_product,
    fetch_manual_products,
    fetch_manual_product,
    update_manual_product,
    delete_manual_product,
    fetch_customer_by_email,
    fetch_customer_by_id,
    create_customer,
    update_customer_last_login,
    update_customer_profile_self,
    update_customer_password,
    count_recent_password_reset_requests,
    create_customer_password_reset,
    consume_customer_password_reset,
    revoke_customer_password_resets,
    list_customer_addresses,
    create_customer_address,
    upsert_customer_primary_address,
    list_customer_favorites,
    add_customer_favorite,
    remove_customer_favorite,
    list_customer_cart_items,
    upsert_customer_cart_item,
    update_customer_cart_item_quantity,
    remove_customer_cart_item,
    list_customer_orders,
    list_customer_order_items,
    has_verified_purchase,
    list_reviews_for_product,
    list_customer_reviews,
    create_customer_review,
    update_customer_admin,
)
from ..etsy import extract_listing_id, fetch_listing
from ..utils.email import send_email


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

# List all customers (for admin dashboard)
from ..db import list_all_customers

@api.get("/customers")
@require_auth
def list_customers():
    if g.auth_payload.get("role") == "customer":
        return jsonify({"error": "forbidden"}), 403
    customers = list_all_customers()
    for customer in customers:
        customer.pop("password_hash", None)
    return jsonify(customers), 200


@api.put("/customers/<int:customer_id>")
@require_auth
def admin_update_customer(customer_id):
    if g.auth_payload.get("role") == "customer":
        return jsonify({"error": "forbidden"}), 403

    init_db()
    payload = request.get_json(silent=True) or {}
    update_payload = {
        "email": (payload.get("email") or "").strip().lower(),
        "first_name": (payload.get("first_name") or "").strip() or None,
        "last_name": (payload.get("last_name") or "").strip() or None,
        "phone": (payload.get("phone") or "").strip() or None,
        "admin_notes": (payload.get("admin_notes") or "").strip() or None,
    }

    if not update_payload["email"]:
        return jsonify({"error": "email_required"}), 400

    address_payload = payload.get("address") if isinstance(payload.get("address"), dict) else None

    try:
        updated = update_customer_admin(customer_id, update_payload)
        if updated and address_payload:
            upsert_customer_primary_address(customer_id, {
                "label": (address_payload.get("label") or "Primary").strip() or "Primary",
                "line1": (address_payload.get("line1") or "").strip() or None,
                "line2": (address_payload.get("line2") or "").strip() or None,
                "city": (address_payload.get("city") or "").strip() or None,
                "state": (address_payload.get("state") or "").strip() or None,
                "postal_code": (address_payload.get("postal_code") or "").strip() or None,
                "country": (address_payload.get("country") or "").strip() or None,
            })
    except Exception as exc:
        if "duplicate" in str(exc).lower() or "unique" in str(exc).lower():
            return jsonify({"error": "email_in_use"}), 409
        return jsonify({"error": "update_failed"}), 500

    if not updated:
        return jsonify({"error": "not_found"}), 404

    updated.pop("password_hash", None)
    return jsonify(updated), 200


@api.get("/customers/<int:customer_id>/details")
@require_auth
def admin_get_customer_details(customer_id):
    if g.auth_payload.get("role") == "customer":
        return jsonify({"error": "forbidden"}), 403

    init_db()
    customer = fetch_customer_by_id(customer_id)
    if not customer:
        return jsonify({"error": "not_found"}), 404
    customer.pop("password_hash", None)

    addresses = list_customer_addresses(customer_id)
    return jsonify({
        "customer": customer,
        "addresses": addresses,
    }), 200


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

# Explicit OPTIONS handler for CORS preflight
@api.route("/auth/login", methods=["OPTIONS"])
def login_options():
    from flask import make_response, request
    response = make_response('', 200)
    response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


# OPTIONS handler for customer signup
@api.route("/customer/signup", methods=["OPTIONS"])
def customer_signup_options():
    from flask import make_response, request
    response = make_response('', 200)
    response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


# OPTIONS handler for customer login
@api.route("/customer/login", methods=["OPTIONS"])
def customer_login_options():
    from flask import make_response, request
    response = make_response('', 200)
    response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


@api.post("/customer/signup")
def customer_signup():
    init_db()
    payload = request.get_json(silent=True) or {}
    email = payload.get("email", "").strip().lower()
    password = payload.get("password", "")

    if not email or not password:
        return jsonify({"error": "missing_credentials"}), 400
    if fetch_customer_by_email(email):
        return jsonify({"error": "email_in_use"}), 409

    customer_id = create_customer({
        "email": email,
        "password_hash": generate_password_hash(password),
        "first_name": payload.get("first_name"),
        "last_name": payload.get("last_name"),
        "phone": payload.get("phone"),
    })
    token = create_token(email, role="customer", customer_id=customer_id)
    return jsonify({"token": token, "customer_id": customer_id}), 201


@api.post("/customer/login")
def customer_login():
    init_db()
    payload = request.get_json(silent=True) or {}
    email = payload.get("email", "").strip().lower()
    password = payload.get("password", "")

    customer = fetch_customer_by_email(email)
    if not customer or not check_password_hash(customer["password_hash"], password):
        return jsonify({"error": "invalid_credentials"}), 401

    update_customer_last_login(customer["id"])
    token = create_token(email, role="customer", customer_id=customer["id"])
    return jsonify({"token": token, "customer_id": customer["id"]})


def _password_reset_link(token):
    base = (os.environ.get("FRONTEND_BASE_URL") or "").strip().rstrip("/")
    if not base:
        origin = request.headers.get("Origin")
        if origin:
            base = origin.strip().rstrip("/")
        else:
            base = request.host_url.rstrip("/")
    return f"{base}/#/account/reset-password?token={quote(token)}"


def _password_reset_email_body(reset_link):
    return f"""
    <html>
    <body>
      <h2>Reset your password</h2>
      <p>We received a request to reset your SGCG account password.</p>
      <p><a href=\"{reset_link}\">Click here to reset your password</a></p>
      <p>This link expires in 30 minutes and can only be used once.</p>
      <p>If you did not request this, you can ignore this email.</p>
      <hr>
      <p>SGCG Art Glass Team</p>
    </body>
    </html>
    """


@api.post("/customer/password/forgot")
def customer_forgot_password():
    init_db()
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()

    generic_response = {
        "success": True,
        "message": "If an account with that email exists, a reset link has been sent.",
    }

    if not email:
        return jsonify(generic_response), 200

    customer = fetch_customer_by_email(email)
    if not customer:
        return jsonify(generic_response), 200

    now = datetime.utcnow()
    one_hour_ago = (now - timedelta(hours=1)).isoformat()
    request_ip = (request.headers.get("X-Forwarded-For") or request.remote_addr or "").split(",")[0].strip() or None
    user_agent = (request.headers.get("User-Agent") or "")[:255] or None
    limits = count_recent_password_reset_requests(customer["id"], request_ip, one_hour_ago)

    if limits["customer_count"] >= 5 or limits["ip_count"] >= 20:
        return jsonify(generic_response), 200

    reset_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(reset_token.encode("utf-8")).hexdigest()
    expires_at = (now + timedelta(minutes=30)).isoformat()
    create_customer_password_reset(customer["id"], token_hash, expires_at, request_ip=request_ip, user_agent=user_agent)

    reset_link = _password_reset_link(reset_token)
    sent = send_email(
        email,
        "SGCG Password Reset",
        _password_reset_email_body(reset_link),
    )
    if not sent:
        # Keep response generic for security; log delivery failure for operators.
        current_app.logger.warning("Password reset email was not delivered for customer_id=%s", customer["id"])

    return jsonify(generic_response), 200


@api.post("/customer/password/reset")
def customer_reset_password():
    init_db()
    payload = request.get_json(silent=True) or {}
    token = (payload.get("token") or "").strip()
    new_password = payload.get("new_password") or ""

    if not token or not new_password:
        return jsonify({"error": "missing_credentials"}), 400
    if len(new_password) < 8:
        return jsonify({"error": "password_too_short"}), 400

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now_iso = datetime.utcnow().isoformat()
    customer_id = consume_customer_password_reset(token_hash, now_iso)
    if not customer_id:
        return jsonify({"error": "invalid_or_expired_token"}), 400

    updated = update_customer_password(customer_id, generate_password_hash(new_password))
    if not updated:
        return jsonify({"error": "update_failed"}), 500

    revoke_customer_password_resets(customer_id)
    return jsonify({"success": True}), 200


@api.get("/customer/me")
@require_customer
def customer_me():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    customer = fetch_customer_by_id(customer_id)
    if not customer:
        return jsonify({"error": "not_found"}), 404
    customer.pop("password_hash", None)
    customer.pop("admin_notes", None)
    return jsonify(customer)


@api.put("/customer/me")
@require_customer
def customer_update_me():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    payload = request.get_json(silent=True) or {}

    update_payload = {
        "first_name": (payload.get("first_name") or "").strip() or None,
        "last_name": (payload.get("last_name") or "").strip() or None,
        "phone": (payload.get("phone") or "").strip() or None,
    }

    updated = update_customer_profile_self(customer_id, update_payload)
    if not updated:
        return jsonify({"error": "not_found"}), 404
    updated.pop("password_hash", None)
    updated.pop("admin_notes", None)
    return jsonify(updated), 200


@api.get("/customer/addresses")
@require_customer
def customer_addresses():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    return jsonify(list_customer_addresses(customer_id))


@api.post("/customer/addresses")
@require_customer
def customer_add_address():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    payload = request.get_json(silent=True) or {}
    if not payload.get("line1"):
        return jsonify({"error": "missing_address"}), 400
    address_id = create_customer_address(customer_id, payload)
    return jsonify({"id": address_id}), 201


@api.put("/customer/addresses/primary")
@require_customer
def customer_update_primary_address():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    payload = request.get_json(silent=True) or {}
    if not payload.get("line1"):
        return jsonify({"error": "missing_address"}), 400

    upsert_customer_primary_address(customer_id, {
        "label": (payload.get("label") or "Primary").strip() or "Primary",
        "line1": (payload.get("line1") or "").strip() or None,
        "line2": (payload.get("line2") or "").strip() or None,
        "city": (payload.get("city") or "").strip() or None,
        "state": (payload.get("state") or "").strip() or None,
        "postal_code": (payload.get("postal_code") or "").strip() or None,
        "country": (payload.get("country") or "").strip() or None,
    })
    return jsonify({"success": True}), 200


@api.put("/customer/password")
@require_customer
def customer_change_password():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    payload = request.get_json(silent=True) or {}
    old_password = payload.get("old_password") or ""
    new_password = payload.get("new_password") or ""

    if not old_password or not new_password:
        return jsonify({"error": "missing_password"}), 400
    if len(new_password) < 8:
        return jsonify({"error": "password_too_short"}), 400

    customer = fetch_customer_by_id(customer_id)
    if not customer:
        return jsonify({"error": "not_found"}), 404
    if not check_password_hash(customer.get("password_hash", ""), old_password):
        return jsonify({"error": "invalid_old_password"}), 400

    updated = update_customer_password(customer_id, generate_password_hash(new_password))
    if not updated:
        return jsonify({"error": "update_failed"}), 500
    return jsonify({"success": True}), 200


@api.get("/customer/favorites")
@require_customer
def customer_favorites():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    return jsonify(list_customer_favorites(customer_id))


@api.post("/customer/favorites")
@require_customer
def customer_add_favorite():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    payload = request.get_json(silent=True) or {}
    product_type = payload.get("product_type")
    product_id = payload.get("product_id")
    if not product_type or not product_id:
        return jsonify({"error": "missing_product"}), 400
    add_customer_favorite(customer_id, product_type, str(product_id))
    return jsonify({"success": True}), 201


@api.delete("/customer/favorites/<int:favorite_id>")
@require_customer
def customer_remove_favorite(favorite_id):
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    remove_customer_favorite(customer_id, favorite_id)
    return jsonify({"success": True})


@api.get("/customer/cart")
@require_customer
def customer_cart():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    return jsonify(list_customer_cart_items(customer_id))


@api.post("/customer/cart/items")
@require_customer
def customer_add_cart_item():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    payload = request.get_json(silent=True) or {}
    product_type = payload.get("product_type")
    product_id = payload.get("product_id")
    quantity = int(payload.get("quantity", 1))
    if not product_type or not product_id:
        return jsonify({"error": "missing_product"}), 400
    upsert_customer_cart_item(customer_id, product_type, str(product_id), quantity)
    return jsonify({"success": True}), 201


@api.put("/customer/cart/items/<int:item_id>")
@require_customer
def customer_update_cart_item(item_id):
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    payload = request.get_json(silent=True) or {}
    quantity = int(payload.get("quantity", 1))
    update_customer_cart_item_quantity(customer_id, item_id, quantity)
    return jsonify({"success": True})


@api.delete("/customer/cart/items/<int:item_id>")
@require_customer
def customer_remove_cart_item(item_id):
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    remove_customer_cart_item(customer_id, item_id)
    return jsonify({"success": True})


@api.get("/customer/orders")
@require_customer
def customer_orders():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    return jsonify(list_customer_orders(customer_id))


@api.get("/customer/orders/<int:order_id>/items")
@require_customer
def customer_order_items(order_id):
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    return jsonify(list_customer_order_items(customer_id, order_id))


@api.get("/customer/reviews")
@require_customer
def customer_reviews():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    return jsonify(list_customer_reviews(customer_id))


@api.get("/reviews")
def product_reviews():
    init_db()
    product_type = request.args.get("product_type")
    product_id = request.args.get("product_id")
    if not product_type or not product_id:
        return jsonify({"error": "missing_product"}), 400
    return jsonify(list_reviews_for_product(product_type, str(product_id)))


@api.post("/customer/reviews")
@require_customer
def customer_create_review():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    payload = request.get_json(silent=True) or {}
    product_type = payload.get("product_type")
    product_id = payload.get("product_id")
    rating = payload.get("rating")
    if not product_type or not product_id or not rating:
        return jsonify({"error": "missing_fields"}), 400

    verified = has_verified_purchase(customer_id, product_type, str(product_id))
    if not verified:
        return jsonify({"error": "not_verified_buyer"}), 403

    review_id = create_customer_review(customer_id, payload, verified)
    return jsonify({"id": review_id}), 201


@api.get("/items")
def list_items():
    init_db()
    items = fetch_items()
    if items is None:
        items = []
    return jsonify(items), 200


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


@api.get("/manual-products")
def list_manual_products():
    init_db()
    products = fetch_manual_products()
    if products is None:
        products = []
    return jsonify(products), 200


@api.get("/manual-products/<int:product_id>")
def get_manual_product(product_id):
    init_db()
    product = fetch_manual_product(product_id)
    if not product:
        return jsonify({"error": "not_found"}), 404
    return jsonify(product)


@api.post("/manual-products")
@require_auth
def create_manual_product_endpoint():
    init_db()
    payload = request.get_json(silent=True) or {}
    if not payload.get("name") or not payload.get("name").strip():
        return jsonify({"error": "missing_name", "detail": "Product name is required"}), 400
    if not payload.get("description") or not payload.get("description").strip():
        return jsonify({"error": "missing_description", "detail": "Product description is required"}), 400
    if payload.get("price") is None or payload.get("price") == "":
        return jsonify({"error": "missing_price", "detail": "Product price is required"}), 400
    if payload.get("quantity") is None or payload.get("quantity") == "":
        return jsonify({"error": "missing_quantity", "detail": "Product quantity is required"}), 400
    try:
        product_id = create_manual_product(payload)
        product = fetch_manual_product(product_id)
        return jsonify(product), 201
    except Exception as exc:
        return jsonify({"error": "creation_failed", "detail": str(exc)}), 500


@api.put("/manual-products/<int:product_id>")
@require_auth
def update_manual_product_endpoint(product_id):
    init_db()
    product = fetch_manual_product(product_id)
    if not product:
        return jsonify({"error": "not_found"}), 404
    payload = request.get_json(silent=True) or {}
    if not payload.get("name"):
        return jsonify({"error": "missing_name"}), 400
    if not payload.get("description"):
        return jsonify({"error": "missing_description"}), 400
    if payload.get("price") is None:
        return jsonify({"error": "missing_price"}), 400
    if payload.get("quantity") is None:
        return jsonify({"error": "missing_quantity"}), 400
    try:
        update_manual_product(product_id, payload)
        updated_product = fetch_manual_product(product_id)
        return jsonify(updated_product)
    except Exception as exc:
        return jsonify({"error": "update_failed", "detail": str(exc)}), 500


@api.delete("/manual-products/<int:product_id>")
@require_auth
def delete_manual_product_endpoint(product_id):
    init_db()
    product = fetch_manual_product(product_id)
    if not product:
        return jsonify({"error": "not_found"}), 404
    try:
        delete_manual_product(product_id)
        return jsonify({"success": True, "message": "Product deleted"}), 200
    except Exception as exc:
        return jsonify({"error": "deletion_failed", "detail": str(exc)}), 500
