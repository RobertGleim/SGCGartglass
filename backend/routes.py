import json
import os

from flask import Blueprint, jsonify, request, g
from werkzeug.security import check_password_hash, generate_password_hash

from .auth import create_token, require_auth, require_customer
from .db import (
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
    list_customer_addresses,
    create_customer_address,
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
)
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


@api.get("/customer/me")
@require_customer
def customer_me():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    customer = fetch_customer_by_id(customer_id)
    if not customer:
        return jsonify({"error": "not_found"}), 404
    customer.pop("password_hash", None)
    return jsonify(customer)


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


@api.get("/manual-products")
def list_manual_products():
    init_db()
    return jsonify(fetch_manual_products())


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
    
    # Debug logging
    import sys
    print(f"Received payload: {payload}", file=sys.stderr)
    
    # Validate required fields
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
        print(f"Error creating product: {exc}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return jsonify({"error": "creation_failed", "detail": str(exc)}), 500


@api.put("/manual-products/<int:product_id>")
@require_auth
def update_manual_product_endpoint(product_id):
    init_db()
    product = fetch_manual_product(product_id)
    if not product:
        return jsonify({"error": "not_found"}), 404
    
    payload = request.get_json(silent=True) or {}
    
    # Debug logging
    import sys
    print(f"Update payload for product {product_id}: {payload}", file=sys.stderr)
    print(f"Payload keys: {list(payload.keys())}", file=sys.stderr)
    
    # Validate required fields
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
        print(f"Error updating product: {exc}", file=sys.stderr)
        import traceback
        traceback.print_exc()
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
