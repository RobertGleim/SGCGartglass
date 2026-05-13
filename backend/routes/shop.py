
# ...existing code...

"""
Legacy shop API: auth, customer, items, manual products, etc.
Loaded as backend.routes.shop; api blueprint is re-exported from backend.routes.
"""
import json
import base64
import mimetypes
import os
import hashlib
import re
import secrets
import time
import uuid
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from urllib.parse import quote, urlencode, unquote_to_bytes
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError

from flask import Blueprint, jsonify, request, g, current_app, send_file
from sqlalchemy import func
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

from ..auth import create_token, require_auth, require_customer
from ..services.pattern_render_service import render_numbered_pattern_raster
from ..db import (
    fetch_item,
    fetch_items,
    init_db,
    upsert_item,
    create_manual_product,
    fetch_manual_products,
    fetch_manual_products_catalog,
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
    create_discount_code,
    list_discount_codes,
    get_discount_code_by_code,
    discount_email_has_paid_order,
    has_discount_redemption_for_email,
    record_discount_redemption,
    record_homepage_visit,
    get_homepage_visit_insights,
    list_customer_addresses,
    create_customer_address,
    upsert_customer_primary_address,
    list_customer_favorites,
    count_customer_favorites_total,
    add_customer_favorite,
    remove_customer_favorite,
    list_customer_cart_items,
    upsert_customer_cart_item,
    update_customer_cart_item_quantity,
    remove_customer_cart_item,
    list_customer_orders,
    list_customer_order_items,
    list_customer_order_items_for_order,
    create_customer_order_with_items,
    create_customer_checkout_session_snapshot,
    get_customer_checkout_session_snapshot,
    mark_customer_checkout_session_processed,
    delete_admin_digital_checkout_session,
    list_admin_digital_checkout_sessions,
    list_admin_recent_orders,
    list_admin_shipping_orders,
    mark_customer_order_admin_seen,
    update_admin_customer_order_status,
    update_customer_order_payment_by_reference,
    get_customer_order_id_by_payment_reference,
    append_customer_order_event,
    list_customer_order_events,
    list_customer_pattern_downloads,
    mark_pattern_downloads_emailed,
    upsert_customer_pattern_download,
    get_customer_pattern_download_by_token,
    get_manual_product_download_metadata,
    has_verified_purchase,
    list_customer_review_options,
    list_reviews_for_product,
    list_recent_reviews,
    list_customer_reviews,
    create_customer_review,
    update_customer_review,
    list_admin_reviews,
    update_admin_review,
    delete_admin_review,
    create_review_invite_code,
    list_review_invite_codes,
    get_review_invite_code_by_hash,
    consume_review_invite_code,
    delete_review_invite_code,
    update_customer_admin,
    delete_customer_admin,
    get_invoice_by_id,
    get_login_lockout_remaining,
    record_login_failure,
    clear_login_failures,
)
from ..etsy import extract_listing_id, fetch_listing, fetch_shop_favorers_count
from ..utils.email import send_email, digital_download_email


api = Blueprint("api", __name__)

_CATALOG_CACHE_TTL_SECONDS = 300
_catalog_cache = {
    "items": {"value": None, "expires_at": 0},
    "manual_products": {"value": None, "expires_at": 0},
    "manual_products_summary": {"value": None, "expires_at": 0},
}

ALLOWED_REVIEW_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_REVIEW_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_REVIEW_IMAGE_BYTES = 20 * 1024 * 1024


def _login_policy():
    def _int_env(name, default):
        raw = str(os.environ.get(name) or "").strip()
        if not raw:
            return default
        try:
            return max(1, int(raw))
        except ValueError:
            return default

    return {
        "max_attempts": _int_env("AUTH_LOGIN_MAX_ATTEMPTS", 5),
        "window_seconds": _int_env("AUTH_LOGIN_WINDOW_SECONDS", 900),
        "lockout_seconds": _int_env("AUTH_LOGIN_LOCKOUT_SECONDS", 900),
    }


def _check_login_lock(scope, email, ip):
    init_db()
    policy = _login_policy()
    return get_login_lockout_remaining(scope, email=email, request_ip=ip)


def _record_login_failure(scope, email, ip):
    init_db()
    policy = _login_policy()
    return record_login_failure(
        scope,
        email=email,
        request_ip=ip,
        max_attempts=policy["max_attempts"],
        window_seconds=policy["window_seconds"],
        lockout_seconds=policy["lockout_seconds"],
    )


def _clear_login_failures(scope, email, ip):
    init_db()
    clear_login_failures(scope, email=email, request_ip=ip)


def _resolve_stripe_secret_key():
    """Resolve and validate Stripe secret key from environment."""
    stripe_secret = (
        os.environ.get("STRIPE_SECRET_KEY")
        or os.environ.get("STRIPE_API_SECRET")
        or os.environ.get("STRIPE_SECRET")
        or ""
    ).strip()
    if not stripe_secret:
        return None, {
            "error": "stripe_not_configured",
            "detail": "Set STRIPE_SECRET_KEY to your Stripe secret key (starts with sk_test_ or sk_live_).",
        }

    lower_key = stripe_secret.lower()
    if lower_key.startswith(("pk_", "rk_", "mk_")):
        return None, {
            "error": "stripe_invalid_key_type",
            "detail": "STRIPE_SECRET_KEY must be a secret key (sk_test_ / sk_live_), not a publishable or restricted key.",
        }
    if not lower_key.startswith("sk_"):
        return None, {
            "error": "stripe_invalid_key_format",
            "detail": "STRIPE_SECRET_KEY format is invalid. Expected a key starting with sk_test_ or sk_live_.",
        }

    return stripe_secret, None


def _resolve_stripe_tax_code(item):
    """Resolve Stripe tax code from env vars, with per-item digital/physical override."""
    is_digital = bool((item or {}).get("is_digital"))
    candidate = ""
    if is_digital:
        candidate = (os.environ.get("STRIPE_TAX_CODE_DIGITAL") or "").strip()
    else:
        candidate = (os.environ.get("STRIPE_TAX_CODE_PHYSICAL") or "").strip()

    if not candidate:
        candidate = (os.environ.get("STRIPE_TAX_CODE_DEFAULT") or "").strip()

    return candidate or None


def _cache_get(key):
    slot = _catalog_cache.get(key) or {}
    if slot.get("value") is None:
        return None
    if time.time() >= float(slot.get("expires_at") or 0):
        return None
    return slot.get("value")


def _cache_set(key, value):
    _catalog_cache[key] = {
        "value": value,
        "expires_at": time.time() + _CATALOG_CACHE_TTL_SECONDS,
    }


def _catalog_cache_invalidate(*keys):
    targets = keys or ("items", "manual_products", "manual_products_summary")
    for key in targets:
        _catalog_cache[key] = {"value": None, "expires_at": 0}


def _as_money(value):
    try:
        return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    except Exception:
        return 0.0


def _resolve_cart_product_snapshot(item):
    product_type = str(item.get("product_type") or "").lower()
    product_id = str(item.get("product_id") or "").strip()
    if not product_id:
        return None

    if product_type in {"template", "pattern"}:
        if not product_id.isdigit():
            return None
        from ..models import Template as TemplateModel

        template = TemplateModel.query.filter(
            TemplateModel.id == int(product_id),
            TemplateModel.is_active.is_(True),
        ).first()
        if not template or not bool(template.is_digital_download):
            return None

        return {
            "title": template.name or f"Pattern #{product_id}",
            "price": _as_money(template.price_amount),
            "currency": template.price_currency or "USD",
            "image_url": template.thumbnail_url or template.image_url,
            "product_type": "template",
            "product_id": product_id,
            "requires_shipping": False,
            "is_digital": True,
            "is_on_sale": False,
        }

    if product_type == "manual":
        product = fetch_manual_product(int(product_id)) if product_id.isdigit() else None
        if not product:
            return None
        if not bool(product.get("is_active", True)):
            return None
        is_digital = bool(product.get("is_digital_download"))
        if not is_digital:
            try:
                available_quantity = int(product.get("quantity") or 0)
            except (TypeError, ValueError):
                available_quantity = 0
            if available_quantity <= 0:
                return None

        image_url = None
        images = product.get("images") if isinstance(product.get("images"), list) else []
        if images:
            image_url = images[0].get("image_url")
        current_price = _as_money(product.get("price"))
        old_price = _as_money(product.get("old_price"))
        explicit_discount = _as_money(product.get("discount_percent"))
        is_on_sale = bool((old_price > current_price and old_price > 0) or explicit_discount > 0)
        return {
            "title": product.get("name") or f"Manual product #{product_id}",
            "price": current_price,
            "currency": "USD",
            "image_url": image_url,
            "product_type": "manual",
            "product_id": product_id,
            "requires_shipping": not is_digital,
            "is_digital": is_digital,
            "is_on_sale": is_on_sale,
        }

    if product_type == "invoice":
        # Invoice cart items are stored as product_id like "inv-123".
        invoice_id_raw = product_id
        if invoice_id_raw.lower().startswith("inv-"):
            invoice_id_raw = invoice_id_raw[4:]
        if not invoice_id_raw.isdigit():
            return None

        invoice = get_invoice_by_id(int(invoice_id_raw))
        if not invoice:
            return None

        invoice_number = str(invoice.get("invoice_number") or f"Invoice #{invoice_id_raw}")
        work_order_id = invoice.get("work_order_id")
        title = invoice_number
        if work_order_id:
            title = f"{invoice_number} (Work Order #{work_order_id})"

        return {
            "title": title,
            "price": _as_money(invoice.get("amount")),
            "currency": "USD",
            "image_url": None,
            "product_type": "invoice",
            "product_id": product_id,
            "requires_shipping": True,
            "is_digital": False,
        }

    if product_id.isdigit():
        etsy_item = fetch_item(int(product_id))
    else:
        etsy_item = None
    if not etsy_item:
        return None
    return {
        "title": etsy_item.get("title") or f"Item #{product_id}",
        "price": _as_money(etsy_item.get("price_amount")),
        "currency": etsy_item.get("price_currency") or "USD",
        "image_url": etsy_item.get("image_url"),
        "product_type": item.get("product_type"),
        "product_id": product_id,
        "requires_shipping": True,
        "is_digital": False,
        "is_on_sale": False,
    }


def _calculate_checkout_totals(items):
    item_count = sum(max(1, int(entry.get("quantity", 1))) for entry in items)
    subtotal = _as_money(sum(_as_money(entry.get("line_total")) for entry in items))

    shipping = 0.0
    # Stripe Checkout computes the final tax at payment time.
    tax = 0.0
    total = _as_money(subtotal + shipping + tax)

    return {
        "item_count": item_count,
        "subtotal": subtotal,
        "shipping": shipping,
        "tax": tax,
        "total": total,
        "currency": "USD",
        "tax_source": "stripe_checkout",
    }


def _normalize_checkout_email(value):
    return str(value or "").strip().lower()


def _discount_code_is_active(record):
    if not isinstance(record, dict):
        return False
    if int(record.get("is_active") or 0) != 1:
        return False

    limit_type = str(record.get("limit_type") or "uses").strip().lower()
    now_iso = datetime.utcnow().isoformat()

    if limit_type == "time":
        expires_at = str(record.get("expires_at") or "").strip()
        if not expires_at or expires_at <= now_iso:
            return False
    elif limit_type == "uses":
        max_uses = int(record.get("max_uses") or 0)
        used_count = int(record.get("used_count") or 0)
        if max_uses <= 0 or used_count >= max_uses:
            return False

    return True


def _resolve_checkout_discount(customer_email, discount_code_raw=None):
    email = _normalize_checkout_email(customer_email)
    requested_code = str(discount_code_raw or "").strip().upper()

    auto_discount = None
    auto_percent_raw = str(os.environ.get("NEW_CUSTOMER_DISCOUNT_PERCENT") or "10").strip()
    try:
        auto_percent = max(0.0, min(95.0, float(auto_percent_raw)))
    except Exception:
        auto_percent = 10.0

    if email and auto_percent > 0:
        has_paid_order = discount_email_has_paid_order(email)
        already_claimed = has_discount_redemption_for_email(email, "new_customer_auto")
        if not has_paid_order and not already_claimed:
            auto_discount = {
                "source": "new_customer_auto",
                "code": None,
                "code_id": None,
                "name": "New Customer 10% Off",
                "percent": auto_percent,
            }

    manual_discount = None
    if requested_code:
        row = get_discount_code_by_code(requested_code)
        if not row:
            if auto_discount:
                return {
                    "requested_code": requested_code,
                    "auto_discount": auto_discount,
                    "manual_discount": None,
                    "resolved_discount": auto_discount,
                }, None
            return None, "Invalid discount code."
        if not _discount_code_is_active(row):
            if auto_discount:
                return {
                    "requested_code": requested_code,
                    "auto_discount": auto_discount,
                    "manual_discount": None,
                    "resolved_discount": auto_discount,
                }, None
            return None, "Discount code is inactive or expired."

        manual_discount = {
            "source": "manual_code",
            "code": str(row.get("code") or requested_code),
            "code_id": row.get("id"),
            "name": str(row.get("name") or requested_code),
            "percent": max(0.0, min(95.0, float(row.get("discount_percent") or 0.0))),
        }

    chosen = None
    if auto_discount and manual_discount:
        # For non-sale items, whichever percent is higher should win.
        chosen = manual_discount if float(manual_discount.get("percent") or 0.0) > float(auto_discount.get("percent") or 0.0) else auto_discount
    elif auto_discount:
        chosen = auto_discount
    elif manual_discount:
        chosen = manual_discount

    return {
        "requested_code": requested_code,
        "auto_discount": auto_discount,
        "manual_discount": manual_discount,
        "resolved_discount": chosen,
    }, None


def _format_item_title_list(titles, max_items=4):
    normalized = [str(title or "").strip() for title in (titles or []) if str(title or "").strip()]
    if not normalized:
        return ""
    visible = normalized[:max_items]
    suffix = ""
    hidden_count = len(normalized) - len(visible)
    if hidden_count > 0:
        suffix = f" (+{hidden_count} more)"
    return ", ".join(visible) + suffix


def _apply_discount_to_summary(summary, discount_context):
    base_items = list(summary.get("items") or [])
    if not discount_context or not base_items:
        return summary

    auto_discount = discount_context.get("auto_discount") if isinstance(discount_context, dict) else None
    manual_discount = discount_context.get("manual_discount") if isinstance(discount_context, dict) else None
    auto_percent = max(0.0, min(95.0, float((auto_discount or {}).get("percent") or 0.0)))
    manual_percent = max(0.0, min(95.0, float((manual_discount or {}).get("percent") or 0.0)))

    if auto_percent <= 0 and manual_percent <= 0:
        return summary

    discounted_items = []
    discounted_line_items = 0
    manual_applied_titles = []
    auto_applied_titles = []
    manual_excluded_sale_titles = []
    manual_discount_amount = 0.0
    auto_discount_amount = 0.0

    for item in base_items:
        quantity = max(1, int(item.get("quantity") or 1))
        unit_price = _as_money(item.get("price"))
        title = str(item.get("title") or "Item")
        is_sale_item = bool(item.get("is_on_sale", False))

        applied_percent = 0.0
        applied_source = None

        if auto_percent > 0:
            applied_percent = auto_percent
            applied_source = "new_customer_auto"

        if manual_percent > 0:
            if is_sale_item:
                manual_excluded_sale_titles.append(title)
            elif manual_percent > applied_percent:
                applied_percent = manual_percent
                applied_source = "manual_code"

        if applied_percent > 0:
            discounted_unit = _as_money(max(0.5, unit_price * (1.0 - (applied_percent / 100.0))))
            discounted_line_items += 1
            line_savings = _as_money(max(0.0, (unit_price - discounted_unit) * quantity))
            if applied_source == "manual_code":
                manual_applied_titles.append(title)
                manual_discount_amount = _as_money(manual_discount_amount + line_savings)
            elif applied_source == "new_customer_auto":
                auto_applied_titles.append(title)
                auto_discount_amount = _as_money(auto_discount_amount + line_savings)
        else:
            discounted_unit = unit_price

        discounted_items.append({
            **item,
            "price": discounted_unit,
            "line_total": _as_money(discounted_unit * quantity),
        })

    discounted_totals = _calculate_checkout_totals(discounted_items)
    base_subtotal = _as_money(sum(_as_money(entry.get("line_total")) for entry in base_items))
    discount_amount = _as_money(max(0.0, base_subtotal - _as_money(discounted_totals.get("subtotal"))))
    discounted_totals["pre_discount_subtotal"] = base_subtotal
    discounted_totals["discount_amount"] = discount_amount

    discount_source = None
    display_percent = 0.0
    if manual_applied_titles and auto_applied_titles:
        discount_source = "mixed"
        display_percent = max(manual_percent, auto_percent)
    elif manual_applied_titles:
        discount_source = "manual_code"
        display_percent = manual_percent
    elif auto_applied_titles:
        discount_source = "new_customer_auto"
        display_percent = auto_percent

    discounted_totals["discount_percent"] = display_percent
    discounted_totals["manual_discount_amount"] = _as_money(manual_discount_amount)
    discounted_totals["auto_discount_amount"] = _as_money(auto_discount_amount)

    primary_discount = None
    if discount_source == "manual_code":
        primary_discount = manual_discount
    elif discount_source == "new_customer_auto":
        primary_discount = auto_discount
    elif discount_source == "mixed":
        primary_discount = {
            "source": "mixed",
            "code": (manual_discount or {}).get("code"),
            "code_id": (manual_discount or {}).get("code_id"),
            "name": "Mixed discount",
            "percent": display_percent,
        }

    if not primary_discount:
        return {
            "items": discounted_items,
            "totals": discounted_totals,
            "discount": None,
        }

    return {
        "items": discounted_items,
        "totals": discounted_totals,
        "discount": {
            **primary_discount,
            "amount": discount_amount,
            "eligible_item_count": discounted_line_items,
            "manual_percent": manual_percent if manual_percent > 0 else None,
            "auto_percent": auto_percent if auto_percent > 0 else None,
            "manual_amount": _as_money(manual_discount_amount),
            "auto_amount": _as_money(auto_discount_amount),
            "manual_applied_titles": manual_applied_titles,
            "auto_applied_titles": auto_applied_titles,
            "manual_excluded_sale_titles": manual_excluded_sale_titles,
        },
    }


def _build_checkout_pricing_preview(summary, customer_email, discount_code_raw=None):
    discount_context, discount_error = _resolve_checkout_discount(customer_email, discount_code_raw)
    if discount_error:
        return None, discount_error

    discounted_summary = _apply_discount_to_summary(summary, discount_context)
    discount_payload = discounted_summary.get("discount") or None
    warnings = []
    requested_code = str(discount_code_raw or "").strip()
    has_sale_items = any(bool(entry.get("is_on_sale", False)) for entry in discounted_summary.get("items") or [])
    source = str((discount_payload or {}).get("source") or "").strip().lower()

    if requested_code and has_sale_items:
        warnings.append("Heads up: discount codes apply only to regular-price items. Sale items are excluded from code discounts.")

    if source == "mixed":
        manual_percent = float((discount_payload or {}).get("manual_percent") or 0.0)
        auto_percent = float((discount_payload or {}).get("auto_percent") or 0.0)
        code = str((discount_payload or {}).get("code") or requested_code).strip().upper()
        manual_items_text = _format_item_title_list((discount_payload or {}).get("manual_applied_titles") or [])
        auto_items_text = _format_item_title_list((discount_payload or {}).get("auto_applied_titles") or [])
        if manual_items_text:
            warnings.append(
                f"Applied code {code} ({manual_percent:.0f}%) to regular-price items: {manual_items_text}."
            )
        if auto_items_text:
            warnings.append(
                f"Applied new customer discount ({auto_percent:.0f}%) to sale items: {auto_items_text}."
            )

    if discount_payload and _as_money(discount_payload.get("amount")) <= 0:
        warnings.append("This code did not match any eligible regular-price items in your cart.")

    return {
        "items": discounted_summary.get("items") or [],
        "totals": discounted_summary.get("totals") or {},
        "discount": discount_payload,
        "warnings": warnings,
        "has_sale_items": has_sale_items,
    }, None


def _build_checkout_summary(customer_id):
    cart_items = list_customer_cart_items(customer_id)
    detailed = []
    for cart_item in cart_items:
        quantity = max(1, int(cart_item.get("quantity", 1)))
        snapshot = _resolve_cart_product_snapshot(cart_item)
        if not snapshot:
            continue
        unit_price = _as_money(snapshot.get("price"))
        detailed.append({
            "id": cart_item.get("id"),
            "product_type": snapshot.get("product_type"),
            "product_id": snapshot.get("product_id"),
            "title": snapshot.get("title"),
            "image_url": snapshot.get("image_url"),
            "quantity": quantity,
            "price": unit_price,
            "line_total": _as_money(unit_price * quantity),
            "currency": snapshot.get("currency") or "USD",
            "requires_shipping": bool(snapshot.get("requires_shipping", True)),
            "is_digital": bool(snapshot.get("is_digital", False)),
            "is_on_sale": bool(snapshot.get("is_on_sale", False)),
        })

    totals = _calculate_checkout_totals(detailed)
    return {
        "items": detailed,
        "totals": totals,
    }


def _build_checkout_summary_from_items(items_payload):
    detailed = []
    for raw_item in items_payload or []:
        if not isinstance(raw_item, dict):
            continue
        snapshot = _resolve_cart_product_snapshot({
            "product_type": raw_item.get("product_type"),
            "product_id": raw_item.get("product_id"),
        })
        if not snapshot:
            continue

        quantity = 1
        unit_price = _as_money(snapshot.get("price"))
        detailed.append({
            "id": None,
            "product_type": snapshot.get("product_type"),
            "product_id": snapshot.get("product_id"),
            "title": snapshot.get("title"),
            "image_url": snapshot.get("image_url"),
            "quantity": quantity,
            "price": unit_price,
            "line_total": _as_money(unit_price * quantity),
            "currency": snapshot.get("currency") or "USD",
            "requires_shipping": bool(snapshot.get("requires_shipping", True)),
            "is_digital": bool(snapshot.get("is_digital", False)),
            "is_on_sale": bool(snapshot.get("is_on_sale", False)),
        })

    totals = _calculate_checkout_totals(detailed)
    return {
        "items": detailed,
        "totals": totals,
    }


def _normalize_checkout_snapshot(snapshot, customer_id=None):
    payload = snapshot.get("payload") if isinstance(snapshot, dict) else None
    items = payload.get("items") if isinstance(payload, dict) and isinstance(payload.get("items"), list) else []
    totals = payload.get("totals") if isinstance(payload, dict) and isinstance(payload.get("totals"), dict) else {}

    if items and totals:
        return {"items": items, "totals": totals}
    if customer_id is None:
        return {"items": [], "totals": {}}
    return _build_checkout_summary(customer_id)


def _extract_checkout_customer_details(session):
    shipping_details = session.get("shipping_details") or {}
    shipping_address_raw = shipping_details.get("address") or {}
    shipping_address = {
        "line1": shipping_address_raw.get("line1") or "",
        "line2": shipping_address_raw.get("line2") or "",
        "city": shipping_address_raw.get("city") or "",
        "state": shipping_address_raw.get("state") or "",
        "postal_code": shipping_address_raw.get("postal_code") or "",
        "country": shipping_address_raw.get("country") or "US",
    }
    customer_details = session.get("customer_details") or {}
    metadata = session.get("metadata") or {}
    customer_name = (
        shipping_details.get("name")
        or customer_details.get("name")
        or ""
    ).strip()
    customer_email = (
        customer_details.get("email")
        or session.get("customer_email")
        or metadata.get("customer_email")
        or ""
    ).strip()
    return customer_name, customer_email, shipping_address


def _issue_pattern_downloads(customer_id, order_id, items, customer_email):
    from ..models import Template as TemplateModel

    downloads = []
    seen_keys = set()
    for item in items or []:
        normalized_product_type = str(item.get("product_type") or "").lower()
        product_id = str(item.get("product_id") or "").strip()
        if not product_id.isdigit():
            continue
        if normalized_product_type == "template":
            dedupe_key = f"template:{product_id}"
        elif normalized_product_type == "manual":
            dedupe_key = f"manual:{product_id}"
        else:
            continue
        if dedupe_key in seen_keys:
            continue

        if normalized_product_type == "template":
            template = TemplateModel.query.filter(TemplateModel.id == int(product_id)).first()
            if not template or not bool(template.is_digital_download):
                continue
            seen_keys.add(dedupe_key)
            grant = upsert_customer_pattern_download(
                customer_id,
                "template",
                int(product_id),
                order_id=order_id,
                customer_email=customer_email or None,
            )
            downloads.append({
                "id": grant.get("id"),
                "pattern_id": int(product_id),
                "pattern_name": template.name,
                "pattern_source_type": "template",
                "download_token": grant.get("download_token"),
                "download_url": _resolve_pattern_download_url(grant.get("download_token")),
                "created": bool(grant.get("created")),
            })
            continue

        product = fetch_manual_product(int(product_id))
        if not product or not bool(product.get("is_digital_download")):
            continue

        seen_keys.add(dedupe_key)
        grant = upsert_customer_pattern_download(
            customer_id,
            "manual",
            int(product_id),
            order_id=order_id,
            customer_email=customer_email or None,
        )
        downloads.append({
            "id": grant.get("id"),
            "pattern_id": int(product_id),
            "pattern_name": product.get("name") or f"Pattern #{product_id}",
            "pattern_source_type": "manual",
            "download_token": grant.get("download_token"),
            "download_url": _resolve_pattern_download_url(grant.get("download_token")),
            "created": bool(grant.get("created")),
        })

    return downloads


def _build_order_response(
    order_id,
    order_number,
    totals,
    downloads=None,
    already_placed=False,
    downloads_email_sent=None,
    downloads_email_target="",
    downloads_created_count=0,
):
    total_amount = totals.get("total") if isinstance(totals, dict) else None
    currency = (totals.get("currency") if isinstance(totals, dict) else None) or "USD"
    if total_amount is None and isinstance(totals, dict):
        total_amount = totals.get("total_amount")
    return {
        "success": True,
        "already_placed": already_placed,
        "order": {
            "id": order_id,
            "order_number": order_number,
            "status": "confirmed",
            "payment_status": "paid",
            "total_amount": total_amount,
            "currency": currency,
        },
        "downloads": downloads or [],
        "downloads_email_sent": downloads_email_sent,
        "downloads_email_target": str(downloads_email_target or "").strip(),
        "downloads_created_count": max(0, int(downloads_created_count or 0)),
    }


def _resolve_digital_item_identity_by_title(title):
    normalized_title = str(title or "").strip().lower()
    if not normalized_title:
        return None

    try:
        from ..models import Template as TemplateModel

        entry = TemplateModel.query.filter(
            TemplateModel.is_digital_download.is_(True),
            func.lower(TemplateModel.name) == normalized_title,
        ).first()
        if entry:
            return {"product_type": "template", "product_id": str(entry.id), "is_digital": True}
    except Exception:
        pass

    try:
        manual_products = fetch_manual_products_catalog() or []
        for entry in manual_products:
            if not bool(entry.get("is_digital_download")):
                continue
            if str(entry.get("name") or "").strip().lower() == normalized_title:
                return {"product_type": "manual", "product_id": str(entry.get("id")), "is_digital": True}
    except Exception:
        pass

    return None


def _hydrate_checkout_summary_from_session(session, customer_id=None):
    line_items_container = session.get("line_items") or {}
    raw_line_items = line_items_container.get("data") if isinstance(line_items_container, dict) else []
    if not isinstance(raw_line_items, list):
        raw_line_items = []

    hydrated_items = []
    for index, line_item in enumerate(raw_line_items):
        if not isinstance(line_item, dict):
            continue
        quantity = max(1, int(line_item.get("quantity") or 1))
        price_obj = line_item.get("price") or {}
        product_obj = price_obj.get("product") if isinstance(price_obj, dict) else {}
        if not isinstance(product_obj, dict):
            product_obj = {}

        product_metadata = product_obj.get("metadata") or {}
        if not isinstance(product_metadata, dict):
            product_metadata = {}

        title = str(
            line_item.get("description")
            or product_obj.get("name")
            or "Item"
        ).strip()[:500]

        product_type = str(product_metadata.get("product_type") or "").strip().lower()
        product_id = str(product_metadata.get("product_id") or "").strip()
        is_digital_raw = str(product_metadata.get("is_digital") or "").strip().lower()
        is_digital = is_digital_raw in {"1", "true", "yes", "on"}

        if (not product_type or not product_id) and customer_id is not None:
            guessed = _resolve_digital_item_identity_by_title(title)
            if guessed:
                product_type = guessed.get("product_type") or product_type
                product_id = guessed.get("product_id") or product_id
                is_digital = bool(guessed.get("is_digital"))

        if not product_type:
            product_type = "stripe"
        if not product_id:
            product_id = str(product_obj.get("id") or price_obj.get("id") or line_item.get("id") or f"stripe-{index + 1}")

        amount_total = line_item.get("amount_total")
        if amount_total is None:
            amount_total = line_item.get("amount_subtotal")
        line_total = _as_money((float(amount_total) if amount_total is not None else 0.0) / 100.0)

        if line_total <= 0:
            unit_amount = price_obj.get("unit_amount") if isinstance(price_obj, dict) else None
            line_total = _as_money(((float(unit_amount) if unit_amount is not None else 0.0) / 100.0) * quantity)

        unit_price = _as_money(line_total / quantity)

        hydrated_items.append({
            "id": None,
            "product_type": product_type,
            "product_id": product_id,
            "title": title,
            "image_url": None,
            "quantity": quantity,
            "price": unit_price,
            "line_total": line_total,
            "currency": str((price_obj.get("currency") if isinstance(price_obj, dict) else None) or session.get("currency") or "USD").upper(),
            "requires_shipping": not is_digital,
            "is_digital": is_digital,
        })

    total_details = session.get("total_details") or {}
    totals = {
        "item_count": sum(max(1, int(entry.get("quantity") or 1)) for entry in hydrated_items),
        "subtotal": _as_money((float(session.get("amount_subtotal") or 0.0)) / 100.0),
        "shipping": _as_money((float(total_details.get("amount_shipping") or 0.0)) / 100.0),
        "tax": _as_money((float(total_details.get("amount_tax") or 0.0)) / 100.0),
        "total": _as_money((float(session.get("amount_total") or 0.0)) / 100.0),
        "currency": str(session.get("currency") or "USD").upper(),
    }
    if totals["subtotal"] <= 0:
        totals["subtotal"] = _as_money(sum(_as_money(entry.get("line_total")) for entry in hydrated_items))
    if totals["total"] <= 0:
        totals["total"] = _as_money(totals["subtotal"] + totals["shipping"] + totals["tax"])

    return {"items": hydrated_items, "totals": totals}


def _finalize_paid_checkout_session(session, expected_customer_id=None, send_download_email=True):
    session_id = str(session.get("id") or "").strip()
    payment_intent_id = str(session.get("payment_intent") or "").strip()
    metadata = session.get("metadata") or {}
    session_customer_id = str(metadata.get("customer_id") or "").strip()
    customer_name, customer_email, shipping_address = _extract_checkout_customer_details(session)

    if expected_customer_id is not None and session_customer_id and session_customer_id != str(expected_customer_id):
        raise PermissionError("checkout session does not belong to this customer")

    customer_id = expected_customer_id
    if customer_id is None and session_customer_id.isdigit():
        customer_id = int(session_customer_id)

    if customer_id is None and customer_email:
        existing_customer = fetch_customer_by_email(customer_email)
        if existing_customer and existing_customer.get("id") is not None:
            customer_id = int(existing_customer.get("id"))
        else:
            name_parts = [part for part in str(customer_name or "").strip().split(" ") if part]
            first_name = name_parts[0] if name_parts else "Guest"
            last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else "Checkout"
            try:
                customer_id = create_customer({
                    "email": customer_email,
                    "password_hash": generate_password_hash(secrets.token_urlsafe(24)),
                    "first_name": first_name,
                    "last_name": last_name,
                    "phone": None,
                })
            except Exception:
                retry_customer = fetch_customer_by_email(customer_email)
                if retry_customer and retry_customer.get("id") is not None:
                    customer_id = int(retry_customer.get("id"))

    if customer_id is None:
        raise ValueError("missing_customer_id")

    # Recovery/finalization can lack customer_details in some Stripe payloads.
    # Fall back to stored customer profile values so download emails still send.
    customer_record = fetch_customer_by_id(customer_id) or {}
    if not customer_email:
        customer_email = str(customer_record.get("email") or "").strip()
    if not customer_name:
        first_name = str(customer_record.get("first_name") or "").strip()
        last_name = str(customer_record.get("last_name") or "").strip()
        customer_name = " ".join([part for part in [first_name, last_name] if part]).strip() or "Customer"

    snapshot = get_customer_checkout_session_snapshot(session_id) if session_id else None
    summary = _normalize_checkout_snapshot(snapshot, customer_id=customer_id)
    items = summary.get("items") or []
    totals = summary.get("totals") or {}
    hydrated = _hydrate_checkout_summary_from_session(session, customer_id=customer_id)

    if not items:
        hydrated_items = hydrated.get("items") or []
        if hydrated_items:
            items = hydrated_items

    hydrated_totals = hydrated.get("totals") or {}
    if _as_money(hydrated_totals.get("total")) > 0:
        totals = hydrated_totals

    if session_id:
        create_customer_checkout_session_snapshot(
            session_id,
            customer_id,
            {
                "items": items,
                "totals": totals,
                "payment_intent_id": payment_intent_id,
            },
            customer_email=customer_email or None,
            status="paid",
        )

    if payment_intent_id:
        existing_order_id = get_customer_order_id_by_payment_reference(payment_intent_id)
        if existing_order_id:
            orders = list_customer_orders(customer_id)
            order = next((entry for entry in orders if entry.get("id") == existing_order_id), None)
            existing_items = items or list_customer_order_items_for_order(existing_order_id)
            downloads = _issue_pattern_downloads(customer_id, existing_order_id, existing_items, customer_email)
            created_downloads = [entry for entry in downloads if bool(entry.get("created"))]
            email_target = (
                str(customer_email or "").strip()
                or str((order or {}).get("customer_email") or "").strip()
                or str(customer_record.get("email") or "").strip()
            )
            name_target = (
                str(customer_name or "").strip()
                or str((order or {}).get("customer_name") or "").strip()
                or "Customer"
            )
            email_sent = None
            if send_download_email and created_downloads:
                email_sent = bool(_send_customer_pattern_download_email(email_target, name_target, created_downloads))
                if email_sent:
                    mark_pattern_downloads_emailed([entry.get("id") for entry in created_downloads])
            order_number = (order or {}).get("order_number") or f"Order #{existing_order_id}"
            return _build_order_response(
                existing_order_id,
                order_number,
                order or totals,
                downloads=downloads,
                already_placed=True,
                downloads_email_sent=email_sent,
                downloads_email_target=email_target,
                downloads_created_count=len(created_downloads),
            )

    if not items:
        raise ValueError("missing_checkout_items")

    order_number = f"SGCG-{datetime.utcnow().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"
    order_payload = {
        "order_number": order_number,
        "status": "confirmed",
        "subtotal_amount": totals.get("subtotal"),
        "shipping_amount": totals.get("shipping"),
        "tax_amount": totals.get("tax"),
        "total_amount": totals.get("total"),
        "currency": totals.get("currency") or "USD",
        "payment_status": "paid",
        "payment_provider": "stripe",
        "payment_reference": payment_intent_id or None,
        "customer_name": customer_name or "Customer",
        "customer_email": customer_email,
        "shipping_address": json.dumps(shipping_address),
        "billing_address": json.dumps(shipping_address),
        "notes": None,
    }

    order_id = create_customer_order_with_items(customer_id, order_payload, items)

    discount_source = str(metadata.get("discount_source") or "").strip().lower()
    discount_percent_raw = str(metadata.get("discount_percent") or "").strip()
    discount_code = str(metadata.get("discount_code") or "").strip().upper() or None
    discount_code_id_raw = str(metadata.get("discount_code_id") or "").strip()
    discount_code_id = int(discount_code_id_raw) if discount_code_id_raw.isdigit() else None

    if discount_source and customer_email:
        should_record = True
        if discount_source == "new_customer_auto":
            should_record = not has_discount_redemption_for_email(customer_email, "new_customer_auto")

        if should_record:
            try:
                discount_percent = float(discount_percent_raw) if discount_percent_raw else None
            except Exception:
                discount_percent = None

            pre_discount_subtotal = _as_money(totals.get("pre_discount_subtotal"))
            subtotal = _as_money(totals.get("subtotal"))
            discount_amount = _as_money(max(0.0, pre_discount_subtotal - subtotal))
            if discount_amount <= 0 and discount_percent and discount_percent > 0:
                discount_amount = _as_money((subtotal * discount_percent) / max(1.0, (100.0 - discount_percent)))

            record_discount_redemption({
                "discount_code_id": discount_code_id,
                "discount_code": discount_code,
                "discount_source": discount_source,
                "customer_email": customer_email,
                "session_id": session_id,
                "order_id": order_id,
                "discount_percent": discount_percent,
                "discount_amount": discount_amount,
            })

    downloads = _issue_pattern_downloads(customer_id, order_id, items, customer_email)
    created_downloads = [entry for entry in downloads if bool(entry.get("created"))]
    if session_id:
        mark_customer_checkout_session_processed(session_id, status="paid")
    email_target = str(customer_email or "").strip()
    email_sent = None
    if send_download_email and created_downloads:
        email_sent = bool(_send_customer_pattern_download_email(email_target, customer_name or "Customer", created_downloads))
        if email_sent:
            mark_pattern_downloads_emailed([entry.get("id") for entry in created_downloads])
    _send_admin_order_email(order_number, totals.get("total", 0), customer_name)
    return _build_order_response(
        order_id,
        order_number,
        totals,
        downloads=downloads,
        already_placed=False,
        downloads_email_sent=email_sent,
        downloads_email_target=email_target,
        downloads_created_count=len(created_downloads),
    )


def _is_admin_request():
    return g.auth_payload.get("role") != "customer"


def _extract_request_ip():
    return (request.headers.get("X-Forwarded-For") or request.remote_addr or "").split(",")[0].strip()


def _hash_visitor_ip(raw_ip):
    normalized_ip = str(raw_ip or "").strip()
    if not normalized_ip:
        return ""

    # Salt hashes so raw visitor IPs are never stored directly.
    salt = str(os.environ.get("VISITOR_IP_HASH_SALT") or os.environ.get("JWT_SECRET") or "sgcg-homepage-visits").strip()
    return hashlib.sha256(f"{salt}:{normalized_ip}".encode("utf-8")).hexdigest()


def _resolve_frontend_public_url():
    configured = (
        os.environ.get("FRONTEND_PUBLIC_URL")
        or os.environ.get("FRONTEND_URL")
        or os.environ.get("FRONTEND_BASE_URL")
        or os.environ.get("APP_PUBLIC_URL")
        or os.environ.get("APP_BASE_URL")
        or ""
    ).strip().rstrip("/")
    if configured:
        return configured

    request_origin = (request.headers.get("Origin") or "").strip().rstrip("/")
    if request_origin:
        return request_origin

    return request.host_url.rstrip("/")


def _resolve_api_public_url():
    configured = (
        os.environ.get("API_PUBLIC_URL")
        or os.environ.get("BACKEND_PUBLIC_URL")
        or os.environ.get("BACKEND_BASE_URL")
        or ""
    ).strip().rstrip("/")
    if configured:
        if configured.endswith("/api"):
            return configured
        return f"{configured}/api"

    return f"{request.host_url.rstrip('/')}/api"


def _build_manual_product_public_link(product_id):
    return f"{_resolve_frontend_public_url()}/#/product/m-{product_id}"


def _post_manual_product_to_facebook_page(*, product, product_link, page_id, access_token):
    api_version = (os.environ.get("FACEBOOK_GRAPH_API_VERSION") or "v20.0").strip()
    endpoint = f"https://graph.facebook.com/{quote(api_version, safe='')}/{quote(str(page_id), safe='')}/feed"

    product_name = (product.get("name") or "Manual Product").strip()
    raw_price = product.get("price")
    try:
        price_text = f"${_as_money(raw_price):.2f}" if raw_price is not None else ""
    except Exception:
        price_text = ""

    message = "\n".join([
        text for text in [
            product_name,
            f"Price: {price_text}" if price_text else "",
            product_link,
        ]
        if text
    ])

    payload = urlencode({
        "message": message,
        "link": product_link,
        "access_token": access_token,
    }).encode("utf-8")

    request_obj = urllib_request.Request(
        endpoint,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    try:
        with urllib_request.urlopen(request_obj, timeout=18) as response:
            body = response.read().decode("utf-8") if response else ""
            parsed = json.loads(body) if body else {}
            return {
                "ok": True,
                "post_id": parsed.get("id"),
                "response": parsed,
            }
    except HTTPError as exc:
        error_body = ""
        try:
            error_body = exc.read().decode("utf-8")
            parsed_error = json.loads(error_body) if error_body else {}
        except Exception:
            parsed_error = {}

        detail = (
            parsed_error.get("error", {}).get("message")
            or error_body
            or "Facebook API request failed."
        )
        return {
            "ok": False,
            "status": exc.code,
            "error": "facebook_api_error",
            "detail": detail,
        }
    except URLError as exc:
        return {
            "ok": False,
            "status": 502,
            "error": "facebook_api_unreachable",
            "detail": str(exc.reason) if getattr(exc, "reason", None) else str(exc),
        }


def _map_payment_to_order_status(payment_status):
    normalized = str(payment_status or "").strip().lower()
    if normalized in {"paid", "processing"}:
        return "confirmed"
    if normalized in {"failed", "requires_payment_method"}:
        return "payment_failed"
    if normalized in {"canceled", "cancelled"}:
        return "cancelled"
    return "pending"


def _send_admin_order_email(order_number, total_amount, customer_name):
    admin_email = (os.environ.get("ADMIN_EMAIL") or "").strip()
    if not admin_email:
        return
    send_email(
        admin_email,
        f"New Customer Order: {order_number}",
        f"""
        <html>
          <body>
            <h2>New Customer Order Received</h2>
            <p><strong>Order:</strong> {order_number}</p>
            <p><strong>Customer:</strong> {customer_name or 'Unknown customer'}</p>
            <p><strong>Total:</strong> ${total_amount:.2f}</p>
            <p>Open the Admin Dashboard → Sales Stats to review this order.</p>
          </body>
        </html>
        """,
    )


def _resolve_pattern_download_url(download_token):
    api_url = _resolve_api_public_url()
    return f"{api_url}/pattern-downloads/{quote(download_token)}"


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
            current_app.logger.exception("failed to decode data-url pattern image for token %s", record.get("download_token") or "runtime")
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


def _build_pattern_download_response(record, download_token=None):
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
        numbered_bytes = render_numbered_pattern_raster(_resolve_pattern_image_bytes({**record, "download_token": download_token}))
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
            current_app.logger.exception("failed to decode data-url pattern download for token %s", download_token or "admin")

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


def _send_customer_pattern_download_email(customer_email, customer_name, downloads):
    if not customer_email or not downloads:
        return False
    return send_email(
        customer_email,
        "Your SGCG digital pattern download is ready",
        digital_download_email(customer_name, downloads),
    )


def _safe_text(value, max_len=1000):
    return str(value or "").strip()[:max_len]


def _list_to_text(value):
    if isinstance(value, list):
        return ", ".join([str(entry).strip() for entry in value if str(entry or "").strip()])
    return _safe_text(value, 1000)


def _resolve_shop_contact_emails():
    # Deliver to the configured support inbox and send from the authenticated mailbox.
    inbox_email = (
        os.environ.get("SHOP_CONTACT_INBOX")
        or os.environ.get("SUPPORT_EMAIL")
        or "customersupport@sgcgart.com"
    ).strip().lower()
    sender_email = (
        os.environ.get("MAIL_DEFAULT_SENDER")
        or os.environ.get("MAIL_USERNAME")
        or os.environ.get("SUPPORT_EMAIL")
        or inbox_email
    ).strip().lower()
    return inbox_email, sender_email


def _normalize_shop_request_tag(value, fallback):
    normalized = _safe_text(value, 40).upper().replace(" ", "_")
    return normalized or fallback


def _hash_review_invite_code(raw_code):
    salt = (
        os.environ.get("REVIEW_CODE_SALT")
        or os.environ.get("JWT_SECRET")
        or "sgcg-review-code"
    )
    return hashlib.sha256(f"{salt}:{raw_code}".encode("utf-8")).hexdigest()


def _split_name(value):
    full_name = str(value or "").strip()
    if not full_name:
        return "Guest", "Reviewer"
    parts = [entry for entry in full_name.split(" ") if entry]
    if len(parts) == 1:
        return parts[0][:120], ""
    return parts[0][:120], " ".join(parts[1:])[:120]


def _normalize_invite_for_public(invite):
    now = datetime.utcnow().isoformat()
    expires_at = invite.get("expires_at")
    is_expired = bool(expires_at and str(expires_at) <= now)
    max_uses = int(invite.get("max_uses") or 1)
    used_count = int(invite.get("used_count") or 0)
    platform = ""
    if str(invite.get("product_type") or "").strip().lower() == "invite":
        platform = str(invite.get("product_id") or "").strip().lower()
    else:
        platform = str(invite.get("product_type") or "").strip().lower()
    return {
        "id": invite.get("id"),
        "product_type": invite.get("product_type"),
        "product_id": invite.get("product_id"),
        "platform": platform,
        "product_name": invite.get("product_name") or "",
        "customer_email": invite.get("customer_email") or "",
        "note": invite.get("note") or "",
        "max_uses": max_uses,
        "used_count": used_count,
        "remaining_uses": max(max_uses - used_count, 0),
        "is_active": bool(invite.get("is_active")),
        "is_expired": is_expired,
        "expires_at": expires_at,
        "created_at": invite.get("created_at"),
    }


@api.post("/shop/custom-order-request")
def submit_custom_order_request():
    payload = request.get_json(silent=True) or {}

    customer_name = _safe_text(payload.get("name"), 120)
    email = _safe_text(payload.get("email"), 255).lower()
    phone = _safe_text(payload.get("phone"), 50)
    project_name = _safe_text(payload.get("project_name"), 180)
    description = _safe_text(payload.get("description"), 4000)
    category = _list_to_text(payload.get("category"))
    materials = _list_to_text(payload.get("materials"))
    width = _safe_text(payload.get("width"), 40)
    height = _safe_text(payload.get("height"), 40)
    depth = _safe_text(payload.get("depth"), 40)
    budget = _safe_text(payload.get("budget"), 60)
    quantity = _safe_text(payload.get("quantity"), 60)
    request_tag = _normalize_shop_request_tag(payload.get("tag") or payload.get("request_type"), "CUSTOM_ORDER")

    if not customer_name or not email or not description:
        return jsonify({"error": "missing_required_fields"}), 400

    support_email, sender_email = _resolve_shop_contact_emails()
    subject = f"[{request_tag}] Custom Order Request - {customer_name}"
    html_body = f"""
    <html>
      <body>
        <h2>New Custom Order Request</h2>
                <p><b>Flag:</b> {request_tag}</p>
        <p><b>Name:</b> {customer_name}</p>
        <p><b>Email:</b> {email}</p>
        <p><b>Phone:</b> {phone or 'N/A'}</p>
        <p><b>Project Name:</b> {project_name or 'N/A'}</p>
        <p><b>Category:</b> {category or 'N/A'}</p>
        <p><b>Materials:</b> {materials or 'N/A'}</p>
        <p><b>Dimensions (W x H x D):</b> {width or 'N/A'} x {height or 'N/A'} x {depth or 'N/A'}</p>
        <p><b>Budget:</b> {budget or 'N/A'}</p>
        <p><b>Quantity:</b> {quantity or 'N/A'}</p>
        <hr />
        <p><b>Description:</b></p>
        <p>{description.replace(chr(10), '<br />')}</p>
      </body>
    </html>
    """

    sent = send_email(
        support_email,
        subject,
        html_body,
        sender=sender_email,
        reply_to=email or sender_email,
    )

    if not sent:
        current_app.logger.warning("Custom order request accepted but email delivery failed for %s", email)
        return jsonify({"success": True, "delivery": "pending", "tag": request_tag}), 202
    return jsonify({"success": True, "tag": request_tag}), 201


@api.post("/shop/contact-request")
def submit_contact_request():
    payload = request.get_json(silent=True) or {}

    customer_name = _safe_text(payload.get("name"), 120)
    phone = _safe_text(payload.get("phone"), 50)
    email = _safe_text(payload.get("email"), 255).lower()
    reason = _safe_text(payload.get("reason"), 120)
    message = _safe_text(payload.get("message"), 4000)
    request_tag = _normalize_shop_request_tag(payload.get("tag") or payload.get("request_type"), "QUESTION")

    if not customer_name or not email or not reason or not message:
        return jsonify({"error": "missing_required_fields"}), 400

    support_email, sender_email = _resolve_shop_contact_emails()
    subject = f"[{request_tag}] Shop Contact Request - {reason}"
    html_body = f"""
    <html>
      <body>
        <h2>New Shop Contact Request</h2>
                <p><b>Flag:</b> {request_tag}</p>
        <p><b>Name:</b> {customer_name}</p>
        <p><b>Email:</b> {email}</p>
        <p><b>Phone:</b> {phone or 'N/A'}</p>
        <p><b>Reason:</b> {reason}</p>
        <hr />
        <p><b>Message:</b></p>
        <p>{message.replace(chr(10), '<br />')}</p>
      </body>
    </html>
    """

    sent = send_email(
        support_email,
        subject,
        html_body,
        sender=sender_email,
        reply_to=email or sender_email,
    )

    if not sent:
        current_app.logger.warning("Contact request accepted but email delivery failed for %s", email)
        return jsonify({"success": True, "delivery": "pending", "tag": request_tag}), 202
    return jsonify({"success": True, "tag": request_tag}), 201


@api.post("/stripe/webhook")
def stripe_webhook():
    init_db()
    webhook_secret = (os.environ.get("STRIPE_WEBHOOK_SECRET") or "").strip()
    app_env = (os.environ.get("APP_ENV") or os.environ.get("FLASK_ENV") or "").strip().lower()
    is_debug = (os.environ.get("FLASK_DEBUG") or "").strip().lower() == "true"
    if not webhook_secret and app_env not in {"development", "testing"} and not is_debug:
        current_app.logger.error("stripe webhook rejected: STRIPE_WEBHOOK_SECRET is not configured")
        return jsonify({"error": "webhook_not_configured"}), 503

    payload = request.get_data(as_text=False)
    signature = request.headers.get("Stripe-Signature")

    try:
        import stripe
        stripe_secret = (
            os.environ.get("STRIPE_SECRET_KEY")
            or os.environ.get("STRIPE_API_SECRET")
            or os.environ.get("STRIPE_SECRET")
            or ""
        ).strip()
        if stripe_secret:
            stripe.api_key = stripe_secret

        if webhook_secret:
            if not signature:
                return jsonify({"error": "missing_signature"}), 400
            event = stripe.Webhook.construct_event(payload, signature, webhook_secret)
        else:
            event = json.loads(payload.decode("utf-8")) if payload else {}
    except Exception as exc:
        current_app.logger.error("stripe webhook parse error: %s", exc)
        return jsonify({"error": "invalid_webhook_payload"}), 400

    event_type = str(event.get("type") or "")
    data_object = (event.get("data") or {}).get("object") or {}

    # checkout.session.completed — hosted Checkout Session paid successfully
    if event_type == "checkout.session.completed":
        session_payment_status = str(data_object.get("payment_status") or "").lower()
        pi_id = str(data_object.get("payment_intent") or "").strip()
        if pi_id and session_payment_status == "paid":
            order_status = "confirmed"
            session_payload = data_object
            try:
                line_items_data = ((session_payload.get("line_items") or {}).get("data") or []) if isinstance(session_payload, dict) else []
                if not line_items_data:
                    session_id = str((session_payload or {}).get("id") or "").strip()
                    if session_id:
                        import stripe

                        stripe_secret, _stripe_key_error = _resolve_stripe_secret_key()
                        if stripe_secret:
                            stripe.api_key = stripe_secret
                            session_payload = stripe.checkout.Session.retrieve(
                                session_id,
                                expand=["line_items.data.price.product", "customer_details"],
                            )
            except Exception as exc:
                current_app.logger.warning("stripe session enrichment failed: %s", exc)
            try:
                finalized = _finalize_paid_checkout_session(session_payload)
            except Exception as exc:
                current_app.logger.error("stripe checkout finalization failed: %s", exc)
                return jsonify({"error": "checkout_finalization_failed", "detail": str(exc)}), 500
            order_id = finalized.get("order", {}).get("id")
            updated = bool(order_id)
            if order_id:
                try:
                    append_customer_order_event(
                        order_id,
                        event_type=event_type,
                        event_detail=f"payment_status=paid, mapped_order_status={order_status}",
                        payload=json.dumps({"event_id": event.get("id"), "type": event_type}),
                    )
                except Exception as exc:
                    current_app.logger.warning("failed to append order event for %s: %s", pi_id, exc)
            return jsonify({"received": True, "event_type": event_type, "payment_intent_id": pi_id, "updated": updated})
        return jsonify({"received": True, "event_type": event_type, "ignored": True})

    # payment_intent.* events
    payment_intent_id = str(data_object.get("id") or "").strip()
    if not payment_intent_id:
        return jsonify({"received": True})

    payment_status = None
    if event_type == "payment_intent.succeeded":
        payment_status = "paid"
    elif event_type == "payment_intent.processing":
        payment_status = "processing"
    elif event_type in {"payment_intent.payment_failed", "payment_intent.requires_payment_method"}:
        payment_status = "failed"
    elif event_type == "payment_intent.canceled":
        payment_status = "canceled"

    if not payment_status:
        return jsonify({"received": True, "ignored": True})

    order_status = _map_payment_to_order_status(payment_status)
    updated = update_customer_order_payment_by_reference(
        payment_intent_id,
        payment_status,
        order_status=order_status,
    )

    order_id = get_customer_order_id_by_payment_reference(payment_intent_id)
    if order_id:
        try:
            append_customer_order_event(
                order_id,
                event_type=event_type,
                event_detail=f"payment_status={payment_status}, mapped_order_status={order_status}",
                payload=json.dumps({"event_id": event.get("id"), "type": event_type}),
            )
        except Exception as exc:
            current_app.logger.warning("failed to append order event for %s: %s", payment_intent_id, exc)

    return jsonify({
        "received": True,
        "event_type": event_type,
        "payment_intent_id": payment_intent_id,
        "updated": updated,
    })


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


@api.delete("/customers/<int:customer_id>")
@require_auth
def admin_delete_customer(customer_id):
    if g.auth_payload.get("role") == "customer":
        return jsonify({"error": "forbidden"}), 403

    init_db()
    target_customer = fetch_customer_by_id(customer_id)
    if not target_customer:
        return jsonify({"error": "not_found"}), 404

    actor_email = (
        str(g.auth_payload.get("email") or "").strip().lower()
        or str(g.auth_payload.get("sub") or "").strip().lower()
    )
    target_email = str(target_customer.get("email") or "").strip().lower()
    if actor_email and target_email and actor_email == target_email:
        return jsonify({"error": "cannot_delete_self"}), 400

    deleted = delete_customer_admin(customer_id)
    if not deleted:
        return jsonify({"error": "not_found"}), 404
    return jsonify({"success": True}), 200


@api.post("/auth/login")
def login():
    payload = request.get_json(silent=True) or {}
    email = payload.get("email", "").strip().lower()
    password = payload.get("password", "")
    request_ip = (request.headers.get("X-Forwarded-For") or request.remote_addr or "").split(",")[0].strip()

    locked_for = _check_login_lock("admin", email, request_ip)
    if locked_for > 0:
        return jsonify({"error": "too_many_attempts", "retry_after_seconds": locked_for}), 429

    admin_email = os.environ.get("ADMIN_EMAIL", "sgcgartglass@gmail.com").strip().lower()
    admin_hash = os.environ.get("ADMIN_PASSWORD_HASH")
    if not admin_hash:
        return jsonify({"error": "admin_not_configured"}), 500

    if email != admin_email or not check_password_hash(admin_hash, password):
        locked_for = _record_login_failure("admin", email, request_ip)
        if locked_for > 0:
            return jsonify({"error": "too_many_attempts", "retry_after_seconds": locked_for}), 429
        return jsonify({"error": "invalid_credentials"}), 401

    _clear_login_failures("admin", email, request_ip)
    token = create_token(email, role="admin")
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
    request_ip = (request.headers.get("X-Forwarded-For") or request.remote_addr or "").split(",")[0].strip()

    locked_for = _check_login_lock("customer", email, request_ip)
    if locked_for > 0:
        return jsonify({"error": "too_many_attempts", "retry_after_seconds": locked_for}), 429

    customer = fetch_customer_by_email(email)
    if not customer or not check_password_hash(customer["password_hash"], password):
        locked_for = _record_login_failure("customer", email, request_ip)
        if locked_for > 0:
            return jsonify({"error": "too_many_attempts", "retry_after_seconds": locked_for}), 429
        return jsonify({"error": "invalid_credentials"}), 401

    _clear_login_failures("customer", email, request_ip)
    update_customer_last_login(customer["id"])
    token = create_token(email, role="customer", customer_id=customer["id"])
    return jsonify({"token": token, "customer_id": customer["id"]})


def _password_reset_link(token):
    base = (os.environ.get("FRONTEND_BASE_URL") or "").strip().rstrip("/")
    if not base:
        cors_origins = [
            origin.strip().rstrip("/")
            for origin in str(os.environ.get("CORS_ORIGINS") or "").split(",")
            if origin.strip() and origin.strip() != "*"
        ]
        base = cors_origins[0] if cors_origins else ""
    if not base:
        app_env = (os.environ.get("APP_ENV") or os.environ.get("FLASK_ENV") or "").strip().lower()
        is_debug = (os.environ.get("FLASK_DEBUG") or "").strip().lower() == "true"
        if app_env in {"development", "testing"} or is_debug:
            base = request.host_url.rstrip("/")
        else:
            raise ValueError("FRONTEND_BASE_URL (or non-wildcard CORS_ORIGINS) must be configured for password reset links")
    return f"{base}/#/account/reset-password?token={quote(token)}"


def _password_reset_email_body(reset_link):
    support_email = (os.environ.get("SUPPORT_EMAIL") or "customersupport@sgcgart.com").strip()
    return f"""
    <html>
    <body>
      <h2>Reset your password</h2>
      <p>We received a request to reset your SGCG account password.</p>
      <p><a href=\"{reset_link}\">Click here to reset your password</a></p>
      <p>This link expires in 30 minutes and can only be used once.</p>
      <p>If you did not request this, you can ignore this email.</p>
        <p>Need help? Contact us at <a href=\"mailto:{support_email}\">{support_email}</a>.</p>
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
        current_app.logger.info("Password reset requested for non-customer email.")
        return jsonify(generic_response), 200

    try:
        now = datetime.utcnow()
        one_hour_ago = (now - timedelta(hours=1)).isoformat()
        request_ip = (request.headers.get("X-Forwarded-For") or request.remote_addr or "").split(",")[0].strip() or None
        user_agent = (request.headers.get("User-Agent") or "")[:255] or None
        limits = count_recent_password_reset_requests(customer["id"], request_ip, one_hour_ago)

        max_per_customer = int((os.environ.get("PASSWORD_RESET_MAX_PER_CUSTOMER_PER_HOUR") or "5").strip())
        max_per_ip = int((os.environ.get("PASSWORD_RESET_MAX_PER_IP_PER_HOUR") or "20").strip())

        if limits["customer_count"] >= max_per_customer or limits["ip_count"] >= max_per_ip:
            current_app.logger.info(
                "Password reset throttled for customer_id=%s (customer_count=%s/%s, ip_count=%s/%s)",
                customer["id"],
                limits["customer_count"],
                max_per_customer,
                limits["ip_count"],
                max_per_ip,
            )
            return jsonify(generic_response), 200

        reset_token = secrets.token_urlsafe(48)
        token_hash = hashlib.sha256(reset_token.encode("utf-8")).hexdigest()
        expires_at = (now + timedelta(minutes=30)).isoformat()
        create_customer_password_reset(customer["id"], token_hash, expires_at, request_ip=request_ip, user_agent=user_agent)

        reset_link = _password_reset_link(reset_token)
        support_email = (os.environ.get("SUPPORT_EMAIL") or "customersupport@sgcgart.com").strip().lower()
        # Sender must be the authenticated SMTP mailbox (Hostinger enforces sender ownership).
        sender_email = (
            current_app.config.get("MAIL_DEFAULT_SENDER")
            or os.environ.get("MAIL_USERNAME")
            or support_email
        ).strip().lower()
        sent = send_email(
            email,
            "SGCG Password Reset",
            _password_reset_email_body(reset_link),
            sender=sender_email,
            reply_to=support_email,
        )
        if not sent:
            # Keep response generic for security; log delivery failure for operators.
            current_app.logger.warning("Password reset email was not delivered for customer_id=%s", customer["id"])
        else:
            current_app.logger.info("Password reset email accepted by SMTP for customer_id=%s", customer["id"])
    except Exception as exc:
        # Never leak account/reset internals to clients.
        current_app.logger.exception("Forgot-password flow failed for customer_id=%s: %s", customer.get("id"), exc)

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


@api.get("/favorites/summary")
def favorites_summary():
    init_db()
    return jsonify({"total": count_customer_favorites_total()})


@api.get("/etsy/shop-summary")
def etsy_shop_summary():
    # Public summary endpoint used by storefront sidebar.
    force_refresh = str(request.args.get("refresh") or "").strip().lower() in {"1", "true", "yes"}
    try:
        summary = fetch_shop_favorers_count(force_refresh=force_refresh)
        return jsonify(summary)
    except Exception as exc:
        return jsonify({
            "total": 0,
            "source_url": "https://www.etsy.com/shop/SGCGArtGlass/favoriters?ref=shop_home",
            "cached": False,
            "error": str(exc),
        }), 200


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


@api.get("/customer/cart/summary")
@require_customer
def customer_cart_summary():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    summary = _build_checkout_summary(customer_id)
    return jsonify(summary)


@api.post("/customer/cart/items")
@require_customer
def customer_add_cart_item():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    payload = request.get_json(silent=True) or {}
    product_type = payload.get("product_type")
    product_id = payload.get("product_id")
    try:
        quantity = int(payload.get("quantity", 1))
    except (TypeError, ValueError):
        quantity = 1
    if not product_type or not product_id:
        return jsonify({"error": "missing_product"}), 400
    normalized_product_type = str(product_type).strip().lower()
    if normalized_product_type in {"template", "pattern"}:
        snapshot = _resolve_cart_product_snapshot({"product_type": "template", "product_id": str(product_id)})
        if not snapshot:
            return jsonify({"error": "invalid_pattern_product"}), 404
        product_type = "template"
    else:
        snapshot = _resolve_cart_product_snapshot({
            "product_type": normalized_product_type,
            "product_id": str(product_id),
        })
        if not snapshot:
            if normalized_product_type == "manual":
                return jsonify({"error": "sold_out_or_unavailable"}), 400
            return jsonify({"error": "invalid_product"}), 404

    clamped_quantity = 1
    upsert_customer_cart_item(customer_id, product_type, str(product_id), clamped_quantity)
    if quantity > 1:
        return jsonify({
            "success": True,
            "warning": "single_item_limit",
            "message": "Items are sold per piece. Please contact customer service if you need more than one of the same item.",
        }), 201
    return jsonify({"success": True}), 201


@api.put("/customer/cart/items/<int:item_id>")
@require_customer
def customer_update_cart_item(item_id):
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    payload = request.get_json(silent=True) or {}
    try:
        quantity = int(payload.get("quantity", 1))
    except (TypeError, ValueError):
        quantity = 1

    if quantity > 1:
        return jsonify({
            "error": "single_item_limit",
            "message": "Items are sold per piece. Please contact customer service if you need more than one of the same item.",
        }), 400

    update_customer_cart_item_quantity(customer_id, item_id, 1)
    return jsonify({"success": True})


@api.delete("/customer/cart/items/<int:item_id>")
@require_customer
def customer_remove_cart_item(item_id):
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    remove_customer_cart_item(customer_id, item_id)
    return jsonify({"success": True})


@api.post("/customer/checkout/preview")
@require_customer
def customer_checkout_preview():
    init_db()
    payload = request.get_json(silent=True) or {}
    customer_id = g.auth_payload.get("customer_id")
    customer = fetch_customer_by_id(customer_id) or {}
    customer_email = _normalize_checkout_email(customer.get("email"))
    summary = _build_checkout_summary(customer_id)

    preview, discount_error = _build_checkout_pricing_preview(
        summary,
        customer_email,
        payload.get("discount_code"),
    )
    if discount_error:
        return jsonify({"error": "invalid_discount_code", "detail": discount_error}), 400

    return jsonify(preview), 200


@api.post("/checkout/preview")
def guest_checkout_preview():
    init_db()
    payload = request.get_json(silent=True) or {}
    customer_email = _normalize_checkout_email(payload.get("customer_email"))
    if not customer_email or "@" not in customer_email or "." not in customer_email.split("@")[-1]:
        return jsonify({"error": "missing_customer_email", "detail": "A valid email is required to preview discounts."}), 400

    items_payload = payload.get("items") if isinstance(payload.get("items"), list) else []
    summary = _build_checkout_summary_from_items(items_payload)
    preview, discount_error = _build_checkout_pricing_preview(
        summary,
        customer_email,
        payload.get("discount_code"),
    )
    if discount_error:
        return jsonify({"error": "invalid_discount_code", "detail": discount_error}), 400

    return jsonify(preview), 200


@api.post("/customer/checkout/session")
@require_customer
def customer_checkout_session():
    """Create a Stripe Checkout Session (hosted payment page) and return the redirect URL."""
    init_db()
    payload = request.get_json(silent=True) or {}
    customer_id = g.auth_payload.get("customer_id")
    customer = fetch_customer_by_id(customer_id) or {}
    summary = _build_checkout_summary(customer_id)

    if not summary.get("items"):
        return jsonify({"error": "cart_empty"}), 400

    stripe_secret, stripe_key_error = _resolve_stripe_secret_key()
    if stripe_key_error:
        return jsonify(stripe_key_error), 503

    import stripe

    stripe.api_key = stripe_secret

    frontend_url = _resolve_frontend_public_url()
    is_live_key = stripe_secret.lower().startswith("sk_live_")
    frontend_url_lc = frontend_url.lower()
    if is_live_key and ("localhost" in frontend_url_lc or "127.0.0.1" in frontend_url_lc):
        return jsonify({
            "error": "invalid_checkout_return_url",
            "detail": "Live Stripe checkout cannot use localhost return URLs. Set FRONTEND_PUBLIC_URL (or FRONTEND_BASE_URL) to your production site URL.",
        }), 503

    # {CHECKOUT_SESSION_ID} is a Stripe template variable substituted server-side
    success_url = f"{frontend_url}/#/checkout/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{frontend_url}/#/checkout"

    customer_email = _normalize_checkout_email(customer.get("email"))
    requested_discount_code = str(payload.get("discount_code") or "").strip().upper()
    preview, discount_error = _build_checkout_pricing_preview(summary, customer_email, requested_discount_code)
    if discount_error:
        return jsonify({"error": "invalid_discount_code", "detail": discount_error}), 400
    summary = {
        "items": preview.get("items") or [],
        "totals": preview.get("totals") or {},
        "discount": preview.get("discount") or None,
    }

    line_items = []
    for item in summary["items"]:
        unit_amount = max(50, int(round(float(item.get("price") or 0) * 100)))
        tax_code = _resolve_stripe_tax_code(item)
        product_data = {
            "name": str(item.get("title") or "Item")[:500],
            "metadata": {
                "product_type": str(item.get("product_type") or "").strip().lower(),
                "product_id": str(item.get("product_id") or "").strip(),
                "is_digital": "true" if bool(item.get("is_digital")) else "false",
            },
        }
        if tax_code:
            product_data["tax_code"] = tax_code
        image_url = str(item.get("image_url") or "").strip()
        if image_url.startswith("https://"):
            product_data["images"] = [image_url]
        line_items.append({
            "price_data": {
                "currency": "usd",
                "unit_amount": unit_amount,
                "tax_behavior": "exclusive",
                "product_data": product_data,
            },
            "quantity": max(1, int(item.get("quantity") or 1)),
        })

    session_metadata = {
        "customer_id": str(customer_id),
        "customer_email": customer.get("email") or "",
    }
    payment_metadata = {"customer_id": str(customer_id)}
    applied_discount = summary.get("discount") or {}
    if applied_discount:
        session_metadata["discount_source"] = str(applied_discount.get("source") or "")
        session_metadata["discount_percent"] = str(applied_discount.get("percent") or "")
        session_metadata["discount_code"] = str(applied_discount.get("code") or "")
        session_metadata["discount_code_id"] = str(applied_discount.get("code_id") or "")
        payment_metadata.update(session_metadata)

    session_params = {
        "line_items": line_items,
        "mode": "payment",
        "automatic_tax": {"enabled": True},
        "billing_address_collection": "required",
        "customer_creation": "always",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": session_metadata,
        "payment_intent_data": {
            "metadata": payment_metadata,
        },
    }
    if any(bool(item.get("requires_shipping", True)) for item in summary.get("items") or []):
        session_params["shipping_address_collection"] = {"allowed_countries": ["US", "CA"]}
    if customer_email:
        session_params["customer_email"] = customer_email

    try:
        session = stripe.checkout.Session.create(**session_params)
    except Exception as exc:
        current_app.logger.error("checkout session creation failed: %s", exc)
        message = str(exc)
        if "Invalid API Key provided" in message:
            return jsonify({
                "error": "stripe_invalid_key",
                "detail": "Stripe key authentication failed. Set STRIPE_SECRET_KEY to a valid sk_test_ or sk_live_ key.",
            }), 503
        return jsonify({"error": "checkout_session_failed", "detail": message}), 502

    create_customer_checkout_session_snapshot(
        session.get("id"),
        customer_id,
        {
            "items": summary.get("items") or [],
            "totals": summary.get("totals") or {},
            "discount": summary.get("discount") or {},
        },
        customer_email=customer_email or None,
        status="pending",
    )

    return jsonify({
        "session_id": session.get("id"),
        "url": session.get("url"),
        "applied_discount": summary.get("discount") or None,
    })


@api.post("/checkout/session")
def guest_checkout_session():
    """Create a Stripe Checkout session for guests (no sign-in required)."""
    init_db()
    payload = request.get_json(silent=True) or {}
    customer_email = _normalize_checkout_email(payload.get("customer_email"))
    if not customer_email or "@" not in customer_email or "." not in customer_email.split("@")[-1]:
        return jsonify({"error": "missing_customer_email", "detail": "A valid email is required for checkout."}), 400

    items_payload = payload.get("items") if isinstance(payload.get("items"), list) else []
    summary = _build_checkout_summary_from_items(items_payload)

    if not summary.get("items"):
        return jsonify({"error": "cart_empty_or_invalid"}), 400

    stripe_secret, stripe_key_error = _resolve_stripe_secret_key()
    if stripe_key_error:
        return jsonify(stripe_key_error), 503

    import stripe

    stripe.api_key = stripe_secret

    frontend_url = _resolve_frontend_public_url()
    is_live_key = stripe_secret.lower().startswith("sk_live_")
    frontend_url_lc = frontend_url.lower()
    if is_live_key and ("localhost" in frontend_url_lc or "127.0.0.1" in frontend_url_lc):
        return jsonify({
            "error": "invalid_checkout_return_url",
            "detail": "Live Stripe checkout cannot use localhost return URLs. Set FRONTEND_PUBLIC_URL (or FRONTEND_BASE_URL) to your production site URL.",
        }), 503

    success_url = f"{frontend_url}/#/checkout/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{frontend_url}/#/checkout"

    requested_discount_code = str(payload.get("discount_code") or "").strip().upper()
    preview, discount_error = _build_checkout_pricing_preview(summary, customer_email, requested_discount_code)
    if discount_error:
        return jsonify({"error": "invalid_discount_code", "detail": discount_error}), 400
    summary = {
        "items": preview.get("items") or [],
        "totals": preview.get("totals") or {},
        "discount": preview.get("discount") or None,
    }

    line_items = []
    for item in summary["items"]:
        unit_amount = max(50, int(round(float(item.get("price") or 0) * 100)))
        tax_code = _resolve_stripe_tax_code(item)
        product_data = {
            "name": str(item.get("title") or "Item")[:500],
            "metadata": {
                "product_type": str(item.get("product_type") or "").strip().lower(),
                "product_id": str(item.get("product_id") or "").strip(),
                "is_digital": "true" if bool(item.get("is_digital")) else "false",
            },
        }
        if tax_code:
            product_data["tax_code"] = tax_code
        image_url = str(item.get("image_url") or "").strip()
        if image_url.startswith("https://"):
            product_data["images"] = [image_url]
        line_items.append({
            "price_data": {
                "currency": "usd",
                "unit_amount": unit_amount,
                "tax_behavior": "exclusive",
                "product_data": product_data,
            },
            "quantity": 1,
        })

    has_shippable_items = any(bool(item.get("requires_shipping", True)) for item in summary.get("items") or [])
    has_digital_items = any(bool(item.get("is_digital")) for item in summary.get("items") or [])

    session_metadata = {
        "guest_checkout": "true",
        "customer_email": customer_email,
    }
    payment_metadata = {
        "guest_checkout": "true",
        "customer_email": customer_email,
    }
    applied_discount = summary.get("discount") or {}
    if applied_discount:
        session_metadata["discount_source"] = str(applied_discount.get("source") or "")
        session_metadata["discount_percent"] = str(applied_discount.get("percent") or "")
        session_metadata["discount_code"] = str(applied_discount.get("code") or "")
        session_metadata["discount_code_id"] = str(applied_discount.get("code_id") or "")
        payment_metadata.update(session_metadata)

    session_params = {
        "line_items": line_items,
        "mode": "payment",
        "automatic_tax": {"enabled": True},
        "billing_address_collection": "required",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": session_metadata,
        # For guest checkout, always let Stripe collect customer identity.
        "customer_creation": "always",
        "payment_intent_data": {
            "metadata": payment_metadata,
        },
    }

    session_params["customer_email"] = customer_email

    # Physical products require shipping address collection in Stripe.
    if has_shippable_items:
        session_params["shipping_address_collection"] = {"allowed_countries": ["US", "CA"]}

    # Digital purchases require a customer email; Stripe Checkout will collect it.
    if has_digital_items:
        session_params["customer_creation"] = "always"

    try:
        session = stripe.checkout.Session.create(**session_params)
    except Exception as exc:
        current_app.logger.error("guest checkout session creation failed: %s", exc)
        message = str(exc)
        if "Invalid API Key provided" in message:
            return jsonify({
                "error": "stripe_invalid_key",
                "detail": "Stripe key authentication failed. Set STRIPE_SECRET_KEY to a valid sk_test_ or sk_live_ key.",
            }), 503
        return jsonify({"error": "checkout_session_failed", "detail": message}), 502

    return jsonify({
        "session_id": session.get("id"),
        "url": session.get("url"),
        "applied_discount": summary.get("discount") or None,
    })


@api.post("/customer/checkout/session/confirm")
@require_customer
def customer_checkout_session_confirm():
    """After Stripe redirects back, verify the session and record the order in the DB."""
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    payload = request.get_json(silent=True) or {}
    session_id = str(payload.get("session_id") or "").strip()

    if not session_id:
        return jsonify({"error": "missing_session_id"}), 400

    stripe_secret, stripe_key_error = _resolve_stripe_secret_key()
    if stripe_key_error:
        return jsonify(stripe_key_error), 503

    import stripe

    stripe.api_key = stripe_secret

    try:
        session = stripe.checkout.Session.retrieve(
            session_id,
            expand=["line_items", "customer_details"],
        )
    except Exception as exc:
        current_app.logger.error("checkout session retrieve failed: %s", exc)
        return jsonify({"error": "session_retrieval_failed"}), 502

    # Verify ownership: customer_id embedded in session metadata must match caller
    session_customer_id = str((session.get("metadata") or {}).get("customer_id") or "").strip()
    if session_customer_id and session_customer_id != str(customer_id):
        return jsonify({"error": "forbidden"}), 403

    if session.get("status") != "complete" or session.get("payment_status") != "paid":
        return jsonify({
            "error": "payment_not_complete",
            "status": session.get("status"),
            "payment_status": session.get("payment_status"),
        }), 400

    result = _finalize_paid_checkout_session(session, expected_customer_id=customer_id)
    return jsonify(result), 200 if result.get("already_placed") else 201


@api.post("/admin/checkout/session/recover")
@require_auth
def admin_recover_checkout_session():
    """Admin-only recovery action to finalize a paid Stripe session by ID."""
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    payload = request.get_json(silent=True) or {}
    session_id = str(payload.get("session_id") or "").strip()
    if not session_id:
        return jsonify({"error": "missing_session_id"}), 400

    stripe_secret, stripe_key_error = _resolve_stripe_secret_key()
    if stripe_key_error:
        return jsonify(stripe_key_error), 503

    import stripe

    stripe.api_key = stripe_secret

    try:
        session = stripe.checkout.Session.retrieve(
            session_id,
            expand=["line_items.data.price.product", "customer_details"],
        )
    except Exception as exc:
        snapshot = get_customer_checkout_session_snapshot(session_id)
        snapshot_status = str((snapshot or {}).get("status") or "").strip().lower()
        if snapshot and snapshot_status in {"paid", "processed"}:
            return jsonify({
                "success": True,
                "already_placed": True,
                "session_id": session_id,
                "message": "Session was already finalized by webhook.",
                "snapshot_status": snapshot_status,
            }), 200

        current_app.logger.error("admin checkout recovery retrieve failed for %s: %s", session_id, exc)
        return jsonify({"error": "session_retrieval_failed", "detail": str(exc)}), 502

    if str(session.get("status") or "") != "complete" or str(session.get("payment_status") or "") != "paid":
        return jsonify({
            "error": "payment_not_complete",
            "status": session.get("status"),
            "payment_status": session.get("payment_status"),
        }), 400

    try:
        result = _finalize_paid_checkout_session(session)
    except Exception as exc:
        current_app.logger.error("admin checkout recovery finalize failed for %s: %s", session_id, exc)
        return jsonify({"error": "checkout_recovery_failed", "detail": str(exc)}), 500

    return jsonify(result), 200 if result.get("already_placed") else 201


@api.get("/admin/checkout/digital-sessions")
@require_auth
def admin_list_digital_checkout_sessions():
    """List checkout sessions that include digital items for one-click recovery/email actions."""
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    limit = request.args.get("limit", default=200, type=int)
    sessions = list_admin_digital_checkout_sessions(limit=limit)
    return jsonify({"items": sessions})


@api.post("/admin/checkout/session/resend-download-email")
@require_auth
def admin_resend_checkout_download_email():
    """Resend digital download unlock email for a paid checkout session."""
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    payload = request.get_json(silent=True) or {}
    session_id = str(payload.get("session_id") or "").strip()
    if not session_id:
        return jsonify({"error": "missing_session_id"}), 400

    stripe_secret, stripe_key_error = _resolve_stripe_secret_key()
    if stripe_key_error:
        return jsonify(stripe_key_error), 503

    import stripe

    stripe.api_key = stripe_secret

    try:
        session = stripe.checkout.Session.retrieve(
            session_id,
            expand=["line_items.data.price.product", "customer_details"],
        )
    except Exception as exc:
        current_app.logger.error("admin resend download email retrieve failed for %s: %s", session_id, exc)
        return jsonify({"error": "session_retrieval_failed", "detail": str(exc)}), 502

    if str(session.get("status") or "") != "complete" or str(session.get("payment_status") or "") != "paid":
        return jsonify({
            "error": "payment_not_complete",
            "status": session.get("status"),
            "payment_status": session.get("payment_status"),
        }), 400

    result = _finalize_paid_checkout_session(session, send_download_email=False)
    downloads = result.get("downloads") or []
    if not downloads:
        return jsonify({"error": "no_digital_downloads", "detail": "No digital downloads found for this session."}), 400

    customer_name, fallback_email, _shipping = _extract_checkout_customer_details(session)
    email_target = str(result.get("downloads_email_target") or "").strip() or str(fallback_email or "").strip()
    name_target = str(customer_name or "").strip() or "Customer"
    if not email_target:
        return jsonify({"error": "missing_customer_email", "detail": "No customer email found for this session."}), 400

    email_sent = bool(_send_customer_pattern_download_email(email_target, name_target, downloads))
    if email_sent:
        mark_pattern_downloads_emailed([entry.get("id") for entry in downloads if entry.get("id")])

    return jsonify({
        "success": True,
        "session_id": session_id,
        "order": result.get("order") or {},
        "downloads_count": len(downloads),
        "downloads_email_target": email_target,
        "downloads_email_sent": email_sent,
    }), 200


@api.delete("/admin/checkout/digital-sessions/<session_id>")
@require_auth
def admin_delete_digital_checkout_session(session_id):
    """Delete a saved digital checkout recovery row without affecting orders/downloads."""
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        return jsonify({"error": "missing_session_id"}), 400

    deleted = delete_admin_digital_checkout_session(normalized_session_id)
    if not deleted:
        return jsonify({"error": "not_found"}), 404

    return jsonify({"success": True, "session_id": normalized_session_id}), 200


@api.get("/admin/analytics/homepage-insights")
@require_auth
def admin_homepage_visit_insights():
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    insights = get_homepage_visit_insights()
    return jsonify(insights), 200


@api.get("/admin/discount-codes")
@require_auth
def admin_list_discount_codes():
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    limit = request.args.get("limit", 100)
    now_iso = datetime.utcnow().isoformat()
    rows = list_discount_codes(limit=limit)
    payload = []
    for row in rows:
        limit_type = str(row.get("limit_type") or "uses").strip().lower()
        expires_at = str(row.get("expires_at") or "").strip()
        max_uses = int(row.get("max_uses") or 0) if row.get("max_uses") is not None else None
        used_count = int(row.get("used_count") or 0)
        is_active = int(row.get("is_active") or 0) == 1
        if limit_type == "time":
            still_valid = bool(expires_at) and expires_at > now_iso
        elif limit_type == "uses":
            still_valid = bool(max_uses and used_count < max_uses)
        else:
            still_valid = True

        payload.append({
            **row,
            "is_active_now": bool(is_active and still_valid),
        })

    return jsonify(payload), 200


@api.post("/admin/discount-codes")
@require_auth
def admin_create_discount_code():
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name") or "").strip()
    code = str(payload.get("code") or "").strip().upper()
    limit_type = str(payload.get("limit_type") or "uses").strip().lower()
    discount_percent_raw = payload.get("discount_percent")

    if not code:
        return jsonify({"error": "missing_code"}), 400
    if len(code) > 80:
        return jsonify({"error": "code_too_long"}), 400

    try:
        discount_percent = float(discount_percent_raw)
    except Exception:
        return jsonify({"error": "invalid_discount_percent"}), 400
    if discount_percent <= 0 or discount_percent > 95:
        return jsonify({"error": "invalid_discount_percent"}), 400

    if limit_type not in {"time", "uses"}:
        return jsonify({"error": "invalid_limit_type"}), 400

    max_uses = None
    expires_at = None
    if limit_type == "uses":
        try:
            max_uses = int(payload.get("max_uses") or 0)
        except Exception:
            max_uses = 0
        if max_uses <= 0:
            return jsonify({"error": "invalid_max_uses"}), 400
    if limit_type == "time":
        try:
            valid_days = int(payload.get("valid_days") or 0)
        except Exception:
            valid_days = 0
        if valid_days <= 0:
            return jsonify({"error": "invalid_valid_days"}), 400
        expires_at = (datetime.utcnow() + timedelta(days=valid_days)).isoformat()

    if get_discount_code_by_code(code):
        return jsonify({"error": "code_exists"}), 409

    created = create_discount_code({
        "code": code,
        "name": name,
        "discount_percent": discount_percent,
        "limit_type": limit_type,
        "max_uses": max_uses,
        "expires_at": expires_at,
        "created_by": str(g.auth_payload.get("sub") or g.auth_payload.get("email") or "admin"),
    })

    return jsonify(created or {}), 201


@api.post("/analytics/home-visit")
def track_homepage_visit():
    """Record an anonymous homepage visit keyed by hashed visitor IP."""
    init_db()

    ip_hash = _hash_visitor_ip(_extract_request_ip())
    if not ip_hash:
        return jsonify({"success": False, "error": "missing_ip"}), 400

    user_agent = (request.headers.get("User-Agent") or "").strip()[:255] or None
    page_path = (request.get_json(silent=True) or {}).get("path") or "/"
    record_homepage_visit(ip_hash, page_path=page_path, user_agent=user_agent)
    return jsonify({"success": True}), 201


@api.get("/customer/orders")
@require_customer
def customer_orders():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    return jsonify(list_customer_orders(customer_id))


@api.get("/customer/pattern-downloads")
@require_customer
def customer_pattern_downloads():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    downloads = list_customer_pattern_downloads(customer_id)
    return jsonify([
        {
            **entry,
            "download_url": _resolve_pattern_download_url(entry.get("download_token")),
        }
        for entry in downloads
    ])


@api.get("/pattern-downloads/<download_token>")
def download_pattern_asset(download_token):
    init_db()
    record = get_customer_pattern_download_by_token(download_token)
    if not record:
        return jsonify({"error": "not_found"}), 404

    return _build_pattern_download_response(record, download_token=download_token)


@api.get("/admin/manual-products/<int:product_id>/pattern-download")
@require_auth
def admin_download_manual_product_pattern(product_id):
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    product = fetch_manual_product(product_id)
    if not product:
        return jsonify({"error": "not_found"}), 404
    if not bool(product.get("is_digital_download")):
        return jsonify({"error": "not_digital_download"}), 400

    record = get_manual_product_download_metadata(product_id) or {}
    if not record:
        images = product.get("images") if isinstance(product.get("images"), list) else []
        first_image = images[0] if images else {}
        record = {
            "pattern_name": product.get("name") or f"Pattern #{product_id}",
            "pattern_description": product.get("description"),
            "pattern_source_type": "manual",
            "manual_product_id": product_id,
            "image_url": first_image.get("image_url") or first_image.get("url") or "",
        }
    return _build_pattern_download_response(record, download_token=f"admin:{product_id}")


@api.get("/customer/orders/<int:order_id>/items")
@require_customer
def customer_order_items(order_id):
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    return jsonify(list_customer_order_items(customer_id, order_id))


@api.get("/admin/orders/recent")
@require_auth
def admin_recent_orders():
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    unseen_only = str(request.args.get("unseen_only", "0")).lower() in {"1", "true", "yes"}
    limit = request.args.get("limit", 20)
    orders = list_admin_recent_orders(limit=limit, unseen_only=unseen_only)
    return jsonify(orders)


@api.put("/admin/orders/<int:order_id>/seen")
@require_auth
def admin_mark_order_seen(order_id):
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    updated = mark_customer_order_admin_seen(order_id)
    if not updated:
        return jsonify({"error": "not_found"}), 404
    return jsonify({"success": True})


@api.get("/admin/orders/shipping")
@require_auth
def admin_shipping_orders():
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    limit = request.args.get("limit", default=250, type=int)
    orders = list_admin_shipping_orders(limit=limit)
    return jsonify({"items": orders})


@api.get("/admin/orders/<int:order_id>/items")
@require_auth
def admin_order_items(order_id):
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    items = list_customer_order_items_for_order(order_id)
    hydrated_items = []
    for item in items:
        payload = dict(item or {})
        product_type = str(payload.get("product_type") or "").strip().lower()
        product_id = str(payload.get("product_id") or "").strip()

        if product_type == "manual" and product_id.isdigit():
            product = fetch_manual_product(int(product_id))
            if product:
                if not str(payload.get("title") or "").strip():
                    payload["title"] = product.get("name") or payload.get("title")
                if not str(payload.get("image_url") or "").strip():
                    images = product.get("images") if isinstance(product.get("images"), list) else []
                    first_image = images[0] if images else {}
                    payload["image_url"] = first_image.get("image_url") or payload.get("image_url")

        elif not str(payload.get("image_url") or "").strip() and product_id.isdigit():
            listing = fetch_item(int(product_id))
            if listing:
                payload["image_url"] = listing.get("image_url") or payload.get("image_url")
                if not str(payload.get("title") or "").strip():
                    payload["title"] = listing.get("title") or payload.get("title")

        hydrated_items.append(payload)

    return jsonify({"items": hydrated_items})


@api.put("/admin/orders/<int:order_id>/shipping-status")
@require_auth
def admin_update_order_shipping_status(order_id):
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    payload = request.get_json(silent=True) or {}
    requested_status = str(payload.get("status") or "").strip().lower()
    if not requested_status:
        return jsonify({"error": "missing_status"}), 400

    try:
        updated = update_admin_customer_order_status(order_id, requested_status)
    except ValueError:
        return jsonify({"error": "invalid_status"}), 400

    if not updated:
        return jsonify({"error": "not_found"}), 404

    applied_status = "confirmed" if requested_status == "need_to_ship" else (
        "completed" if requested_status == "archived" else requested_status
    )
    append_customer_order_event(
        order_id,
        event_type="shipping.status.updated",
        event_detail=f"shipping_status={applied_status}",
        payload=json.dumps({"requested_status": requested_status, "applied_status": applied_status}),
    )
    return jsonify({"success": True, "order_id": order_id, "status": applied_status})


@api.get("/admin/orders/<int:order_id>/events")
@require_auth
def admin_get_order_events(order_id):
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    limit = request.args.get("limit", 30)
    events = list_customer_order_events(order_id, limit=limit)
    return jsonify(events)


@api.get("/customer/reviews")
@require_customer
def customer_reviews():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    return jsonify(list_customer_reviews(customer_id))


@api.get("/customer/review-options")
@require_customer
def customer_review_options():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    return jsonify(list_customer_review_options(customer_id))


@api.get("/reviews")
def product_reviews():
    init_db()
    product_type = request.args.get("product_type")
    product_id = request.args.get("product_id")
    if not product_type or not product_id:
        return jsonify({"error": "missing_product"}), 400
    return jsonify(list_reviews_for_product(product_type, str(product_id)))


@api.get("/reviews/recent")
def recent_reviews():
    init_db()
    limit = request.args.get("limit", 10)
    return jsonify(list_recent_reviews(limit=limit))


@api.post("/reviews/invite-codes/validate")
def validate_review_invite_code():
    init_db()
    payload = request.get_json(silent=True) or {}
    raw_code = str(payload.get("code") or "").strip().upper()
    if not raw_code:
        return jsonify({"error": "missing_code"}), 400

    code_hash = _hash_review_invite_code(raw_code)
    invite = get_review_invite_code_by_hash(code_hash)
    if not invite:
        return jsonify({"error": "invalid_code"}), 404

    normalized = _normalize_invite_for_public(invite)
    if (not normalized["is_active"]) or normalized["is_expired"] or normalized["remaining_uses"] <= 0:
        return jsonify({"error": "invalid_code"}), 400

    return jsonify({"invite": normalized}), 200


@api.post("/reviews/submit-with-code")
def submit_review_with_invite_code():
    init_db()
    raw_code = str(request.form.get("code") or "").strip().upper()
    reviewer_name = str(request.form.get("name") or "").strip()
    review_title = str(request.form.get("title") or "").strip()
    review_body = str(request.form.get("body") or "").strip()
    purchased_at = str(request.form.get("purchased_at") or "").strip()
    purchase_source = str(request.form.get("purchase_source") or "").strip().lower()
    purchase_source_other = str(request.form.get("purchase_source_other") or "").strip()
    rating_raw = request.form.get("rating")

    if not raw_code or not reviewer_name or not review_body or not rating_raw or not purchased_at or not purchase_source:
        return jsonify({"error": "missing_fields"}), 400

    allowed_sources = {"etsy", "ebay", "facebook", "other"}
    if purchase_source not in allowed_sources:
        return jsonify({"error": "invalid_purchase_source"}), 400
    if purchase_source == "other" and not purchase_source_other:
        return jsonify({"error": "missing_purchase_source_other"}), 400

    try:
        rating = int(rating_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid_rating"}), 400
    if rating < 1 or rating > 5:
        return jsonify({"error": "invalid_rating"}), 400

    code_hash = _hash_review_invite_code(raw_code)
    invite = get_review_invite_code_by_hash(code_hash)
    if not invite:
        return jsonify({"error": "invalid_code"}), 404

    normalized_invite = _normalize_invite_for_public(invite)
    if (not normalized_invite["is_active"]) or normalized_invite["is_expired"] or normalized_invite["remaining_uses"] <= 0:
        return jsonify({"error": "invalid_code"}), 400

    review_image_url = None
    image_file = request.files.get("photo")
    if image_file and image_file.filename:
        filename = secure_filename(image_file.filename or "review-photo")
        ext = os.path.splitext(filename)[1].lower()
        mime_type = str(image_file.content_type or "").lower()
        if ext not in ALLOWED_REVIEW_IMAGE_EXTENSIONS or (mime_type and mime_type not in ALLOWED_REVIEW_IMAGE_MIME):
            return jsonify({"error": "invalid_image_type"}), 400

        image_bytes = image_file.read()
        if len(image_bytes) > MAX_REVIEW_IMAGE_BYTES:
            return jsonify({"error": "image_too_large"}), 400

        configured_upload_root = current_app.config.get("UPLOAD_FOLDER")
        if configured_upload_root:
            uploads_dir = os.path.join(str(configured_upload_root), "reviews")
        else:
            uploads_dir = os.path.join(os.path.dirname(__file__), "..", "uploads", "reviews")
        uploads_dir = os.path.abspath(uploads_dir)
        os.makedirs(uploads_dir, exist_ok=True)

        unique_name = f"{uuid.uuid4().hex}{ext}"
        output_path = os.path.join(uploads_dir, unique_name)
        with open(output_path, "wb") as output:
            output.write(image_bytes)
        review_image_url = f"/uploads/reviews/{unique_name}"

    if not consume_review_invite_code(invite.get("id")):
        return jsonify({"error": "invalid_code"}), 400

    first_name, last_name = _split_name(reviewer_name)
    guest_email = f"guest-review-{secrets.token_hex(8)}@sgcg.local"
    guest_customer_id = create_customer({
        "email": guest_email,
        "password_hash": generate_password_hash(secrets.token_urlsafe(18)),
        "first_name": first_name,
        "last_name": last_name,
        "phone": None,
    })

    source_text = purchase_source_other if purchase_source == "other" else purchase_source
    enriched_body = (
        f"{review_body}\n\nPurchased At: {purchased_at}\nPurchased Via: {source_text}"
    )

    review_id = create_customer_review(
        guest_customer_id,
        {
            "product_type": normalized_invite["product_type"],
            "product_id": str(normalized_invite["product_id"]),
            "rating": rating,
            "title": review_title,
            "body": enriched_body,
            "review_image_url": review_image_url,
        },
        False,
    )
    return jsonify({"id": review_id, "status": "pending"}), 201


@api.post("/reviews/submit-public")
def submit_public_review():
    """
    Public endpoint for customers to submit reviews without a code or authentication.
    Useful for QR codes on thank you cards.
    """
    init_db()
    reviewer_name = str(request.form.get("name") or "").strip()
    review_title = str(request.form.get("title") or "").strip()
    review_body = str(request.form.get("body") or "").strip()
    purchased_at = str(request.form.get("purchased_at") or "").strip()
    purchase_source = str(request.form.get("purchase_source") or "").strip().lower()
    purchase_source_other = str(request.form.get("purchase_source_other") or "").strip()
    rating_raw = request.form.get("rating")
    product_type = str(request.form.get("product_type") or "").strip().lower()

    if not reviewer_name or not review_body or not rating_raw or not purchased_at or not purchase_source or not product_type:
        return jsonify({"error": "missing_fields"}), 400

    allowed_sources = {"etsy", "ebay", "facebook", "amazon", "other"}
    if purchase_source not in allowed_sources:
        return jsonify({"error": "invalid_purchase_source"}), 400
    if purchase_source == "other" and not purchase_source_other:
        return jsonify({"error": "missing_purchase_source_other"}), 400

    try:
        rating = int(rating_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid_rating"}), 400
    if rating < 1 or rating > 5:
        return jsonify({"error": "invalid_rating"}), 400

    review_image_url = None
    image_file = request.files.get("photo")
    if image_file and image_file.filename:
        filename = secure_filename(image_file.filename or "review-photo")
        ext = os.path.splitext(filename)[1].lower()
        mime_type = str(image_file.content_type or "").lower()
        if ext not in ALLOWED_REVIEW_IMAGE_EXTENSIONS or (mime_type and mime_type not in ALLOWED_REVIEW_IMAGE_MIME):
            return jsonify({"error": "invalid_image_type"}), 400

        image_bytes = image_file.read()
        if len(image_bytes) > MAX_REVIEW_IMAGE_BYTES:
            return jsonify({"error": "image_too_large"}), 400

        configured_upload_root = current_app.config.get("UPLOAD_FOLDER")
        if configured_upload_root:
            uploads_dir = os.path.join(str(configured_upload_root), "reviews")
        else:
            uploads_dir = os.path.join(os.path.dirname(__file__), "..", "uploads", "reviews")
        uploads_dir = os.path.abspath(uploads_dir)
        os.makedirs(uploads_dir, exist_ok=True)

        unique_name = f"{uuid.uuid4().hex}{ext}"
        output_path = os.path.join(uploads_dir, unique_name)
        with open(output_path, "wb") as output:
            output.write(image_bytes)
        review_image_url = f"/uploads/reviews/{unique_name}"

    first_name, last_name = _split_name(reviewer_name)
    guest_email = f"guest-review-{secrets.token_hex(8)}@sgcg.local"
    guest_customer_id = create_customer({
        "email": guest_email,
        "password_hash": generate_password_hash(secrets.token_urlsafe(18)),
        "first_name": first_name,
        "last_name": last_name,
        "phone": None,
    })

    source_text = purchase_source_other if purchase_source == "other" else purchase_source
    enriched_body = (
        f"{review_body}\n\nPurchased At: {purchased_at}\nPurchased Via: {source_text}"
    )

    review_id = create_customer_review(
        guest_customer_id,
        {
            "product_type": product_type,
            "product_id": "public",
            "rating": rating,
            "title": review_title,
            "body": enriched_body,
            "review_image_url": review_image_url,
        },
        False,
    )
    return jsonify({"id": review_id, "status": "pending"}), 201


@api.post("/customer/reviews")
@require_customer
def customer_create_review():
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    payload = request.get_json(silent=True) or {}
    product_type = str(payload.get("product_type") or "").strip().lower()
    product_id = str(payload.get("product_id") or "").strip()
    rating = payload.get("rating")
    if not product_type or not product_id or not rating:
        return jsonify({"error": "missing_fields"}), 400

    try:
        numeric_rating = int(rating)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid_rating"}), 400
    if numeric_rating < 1 or numeric_rating > 5:
        return jsonify({"error": "invalid_rating"}), 400

    payload["product_type"] = product_type
    payload["product_id"] = product_id
    payload["rating"] = numeric_rating

    verified = has_verified_purchase(customer_id, product_type, str(product_id))
    if not verified:
        return jsonify({"error": "not_verified_buyer"}), 403

    review_id = create_customer_review(customer_id, payload, verified)
    return jsonify({"id": review_id}), 201


@api.post("/admin/reviews")
@require_auth
def admin_create_review():
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    reviewer_name = str(request.form.get("name") or "").strip()
    review_title = str(request.form.get("title") or "").strip()
    review_body = str(request.form.get("body") or "").strip()
    purchased_at = str(request.form.get("purchased_at") or "").strip()
    purchase_source = str(request.form.get("purchase_source") or "").strip().lower()
    purchase_source_other = str(request.form.get("purchase_source_other") or "").strip()
    rating_raw = request.form.get("rating")
    status = str(request.form.get("status") or "approved").strip().lower()

    if not reviewer_name or not review_body or not rating_raw or not purchased_at or not purchase_source:
        return jsonify({"error": "missing_fields"}), 400

    allowed_sources = {"etsy", "ebay", "facebook", "amazon", "other"}
    allowed_statuses = {"approved", "pending", "hidden", "rejected"}
    if purchase_source not in allowed_sources:
        return jsonify({"error": "invalid_purchase_source"}), 400
    if purchase_source == "other" and not purchase_source_other:
        return jsonify({"error": "missing_purchase_source_other"}), 400
    if status not in allowed_statuses:
        return jsonify({"error": "invalid_status"}), 400

    try:
        rating = int(rating_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid_rating"}), 400
    if rating < 1 or rating > 5:
        return jsonify({"error": "invalid_rating"}), 400

    review_image_url = None
    image_file = request.files.get("photo")
    if image_file and image_file.filename:
        filename = secure_filename(image_file.filename or "review-photo")
        ext = os.path.splitext(filename)[1].lower()
        mime_type = str(image_file.content_type or "").lower()
        if ext not in ALLOWED_REVIEW_IMAGE_EXTENSIONS or (mime_type and mime_type not in ALLOWED_REVIEW_IMAGE_MIME):
            return jsonify({"error": "invalid_image_type"}), 400

        image_bytes = image_file.read()
        if len(image_bytes) > MAX_REVIEW_IMAGE_BYTES:
            return jsonify({"error": "image_too_large"}), 400

        configured_upload_root = current_app.config.get("UPLOAD_FOLDER")
        if configured_upload_root:
            uploads_dir = os.path.join(str(configured_upload_root), "reviews")
        else:
            uploads_dir = os.path.join(os.path.dirname(__file__), "..", "uploads", "reviews")
        uploads_dir = os.path.abspath(uploads_dir)
        os.makedirs(uploads_dir, exist_ok=True)

        unique_name = f"{uuid.uuid4().hex}{ext}"
        output_path = os.path.join(uploads_dir, unique_name)
        with open(output_path, "wb") as output:
            output.write(image_bytes)
        review_image_url = f"/uploads/reviews/{unique_name}"

    first_name, last_name = _split_name(reviewer_name)
    guest_email = f"admin-testimonial-{secrets.token_hex(8)}@sgcg.local"
    guest_customer_id = create_customer({
        "email": guest_email,
        "password_hash": generate_password_hash(secrets.token_urlsafe(18)),
        "first_name": first_name,
        "last_name": last_name,
        "phone": None,
    })

    source_text = purchase_source_other if purchase_source == "other" else purchase_source
    enriched_body = (
        f"{review_body}\n\nPurchased At: {purchased_at}\nPurchased Via: {source_text}"
    )

    review_id = create_customer_review(
        guest_customer_id,
        {
            "product_type": "testimonial",
            "product_id": purchase_source,
            "rating": rating,
            "title": review_title,
            "body": enriched_body,
            "review_image_url": review_image_url,
        },
        False,
        status,
    )
    return jsonify({"id": review_id, "status": status}), 201


@api.put("/customer/reviews/<int:review_id>")
@require_customer
def customer_update_review(review_id):
    init_db()
    customer_id = g.auth_payload.get("customer_id")
    payload = request.get_json(silent=True) or {}

    normalized = {}
    if "rating" in payload:
      try:
          rating = int(payload.get("rating"))
      except (TypeError, ValueError):
          return jsonify({"error": "invalid_rating"}), 400
      if rating < 1 or rating > 5:
          return jsonify({"error": "invalid_rating"}), 400
      normalized["rating"] = rating

    if "title" in payload:
        normalized["title"] = payload.get("title")
    if "body" in payload:
        normalized["body"] = payload.get("body")

    if not normalized:
        return jsonify({"error": "missing_fields"}), 400

    updated = update_customer_review(customer_id, review_id, normalized)
    if not updated:
        return jsonify({"error": "not_found_or_forbidden"}), 404
    return jsonify({"success": True, "status": "pending"}), 200


@api.get("/admin/reviews")
@require_auth
def admin_reviews():
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    limit = request.args.get("limit", 200)
    status = request.args.get("status")
    return jsonify(list_admin_reviews(limit=limit, status=status))


@api.get("/admin/review-invite-codes")
@require_auth
def admin_list_review_invite_codes():
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    limit = request.args.get("limit", 100)
    active_only = str(request.args.get("active_only") or "").strip().lower() in {"1", "true", "yes"}
    rows = list_review_invite_codes(limit=limit, active_only=active_only)
    return jsonify([_normalize_invite_for_public(row) for row in rows]), 200


@api.post("/admin/review-invite-codes")
@require_auth
def admin_create_review_invite_code():
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    payload = request.get_json(silent=True) or {}
    platform = str(payload.get("platform") or "").strip().lower()
    product_name = str(payload.get("product_name") or "").strip()
    customer_email = str(payload.get("customer_email") or "").strip().lower()
    note = str(payload.get("note") or "").strip()
    if not platform:
        return jsonify({"error": "missing_platform"}), 400
    allowed_platforms = {"etsy", "facebook", "ebay", "other"}
    if platform not in allowed_platforms:
        return jsonify({"error": "invalid_platform"}), 400
    if customer_email and ("@" not in customer_email or "." not in customer_email.split("@")[-1]):
        return jsonify({"error": "invalid_customer_email"}), 400

    product_type = "invite"
    product_id = platform

    max_uses = 1
    expires_at = None

    raw_code = secrets.token_hex(4).upper()
    code_hash = _hash_review_invite_code(raw_code)

    created_by = str(g.auth_payload.get("sub") or g.auth_payload.get("email") or "admin")
    invite_id = create_review_invite_code(
        code_hash,
        {
            "product_type": product_type,
            "product_id": product_id,
            "product_name": product_name,
            "note": note,
            "max_uses": max_uses,
            "expires_at": expires_at,
            "created_by": created_by,
        },
    )

    created = {
        "id": invite_id,
        "product_type": product_type,
        "product_id": product_id,
        "platform": platform,
        "product_name": product_name,
        "customer_email": customer_email,
        "note": note,
        "max_uses": max_uses,
        "used_count": 0,
        "remaining_uses": max_uses,
        "is_active": True,
        "is_expired": False,
        "expires_at": expires_at,
    }

    email_sent = False
    if customer_email:
        sender_email = (
            current_app.config.get("MAIL_DEFAULT_SENDER")
            or os.environ.get("MAIL_USERNAME")
            or current_app.config.get("SUPPORT_EMAIL")
        )
        review_page_url = (
            os.environ.get("FRONTEND_BASE_URL")
            or os.environ.get("APP_BASE_URL")
            or "https://www.sgcgart.com"
        ).rstrip("/") + "/#/reviews"
        email_subject = "Your SGCG Review Code"
        email_body = f"""
        <html>
          <body>
            <h2>Your SGCG review code</h2>
            <p>Hi there,</p>
            <p>Use the code below to submit your verified review:</p>
            <p style=\"font-size: 1.2rem; font-weight: 700; letter-spacing: 0.05em;\">{raw_code}</p>
            <p><strong>Platform:</strong> {platform.upper()}</p>
            {f"<p><strong>Product:</strong> {product_name}</p>" if product_name else ""}
            <p>Submit your review here: <a href=\"{review_page_url}\">{review_page_url}</a></p>
            <p>Thanks for supporting SGCG Art Glass.</p>
          </body>
        </html>
        """
        email_sent = send_email(
            customer_email,
            email_subject,
            email_body,
            sender=sender_email,
            reply_to=sender_email,
        )

    return jsonify({"code": raw_code, "invite": created, "email_sent": bool(email_sent), "customer_email": customer_email}), 201


@api.delete("/admin/review-invite-codes/<int:invite_id>")
@require_auth
def admin_delete_review_invite_code(invite_id):
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    deleted = delete_review_invite_code(invite_id)
    if not deleted:
        return jsonify({"error": "not_found"}), 404
    return jsonify({"success": True}), 200


@api.put("/admin/reviews/<int:review_id>")
@require_auth
def admin_update_review(review_id):
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    payload = request.get_json(silent=True) or {}
    allowed_statuses = {"approved", "pending", "hidden", "rejected"}
    if "status" in payload and str(payload.get("status") or "").strip().lower() not in allowed_statuses:
        return jsonify({"error": "invalid_status"}), 400
    if "rating" in payload:
        try:
            rating = int(payload.get("rating"))
        except (TypeError, ValueError):
            return jsonify({"error": "invalid_rating"}), 400
        if rating < 1 or rating > 5:
            return jsonify({"error": "invalid_rating"}), 400

    updated = update_admin_review(review_id, payload)
    if not updated:
        return jsonify({"error": "not_found_or_no_changes"}), 404
    return jsonify({"success": True}), 200


@api.delete("/admin/reviews/<int:review_id>")
@require_auth
def admin_delete_review(review_id):
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    deleted = delete_admin_review(review_id)
    if not deleted:
        return jsonify({"error": "not_found"}), 404
    return jsonify({"success": True}), 200


@api.get("/items")
def list_items():
    init_db()
    cached_items = _cache_get("items")
    if cached_items is not None:
        return jsonify(cached_items), 200

    items = fetch_items()
    if items is None:
        items = []
    _cache_set("items", items)
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
    _catalog_cache_invalidate("items")
    return jsonify(item), 201


@api.get("/manual-products")
def list_manual_products():
    try:
        init_db()
        summary_mode = str(request.args.get("summary") or "").strip().lower() in {"1", "true", "yes"}
        cache_key = "manual_products_summary" if summary_mode else None

        if cache_key is not None:
            cached_products = _cache_get(cache_key)
            if cached_products is not None:
                return jsonify(cached_products), 200

        products = fetch_manual_products_catalog() if summary_mode else fetch_manual_products()
        if products is None:
            products = []
        if cache_key is not None:
            _cache_set(cache_key, products)
        return jsonify(products), 200
    except Exception as exc:
        return jsonify({"error": "server_error", "detail": str(exc)}), 500


@api.get("/manual-products/<int:product_id>")
def get_manual_product(product_id):
    init_db()
    product = fetch_manual_product(product_id)
    if not product:
        return jsonify({"error": "not_found"}), 404
    return jsonify(product)


def _resolve_manual_product_quantity(quantity, is_digital_download):
    if quantity is None or quantity == "":
        return 9999 if is_digital_download else 1
    return quantity


def _coerce_bool_value(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _parse_manual_dimension_value(field_name, value):
    label = str(field_name or "Dimension").replace("_", " ").strip().title()
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"{label} must be a number like 25.25 or a fraction like 48 3/8.")
    if isinstance(value, Decimal):
        parsed_value = float(value)
    elif isinstance(value, (int, float)):
        parsed_value = float(value)
    else:
        raw_value = str(value).strip()
        if not raw_value:
            return None

        normalized_value = raw_value.replace("“", '"').replace("”", '"').replace("″", '"')
        normalized_value = re.sub(r"\s+", " ", normalized_value)
        normalized_value = re.sub(r"^([+]?\d+)-(\d+\s*/\s*\d+)$", r"\1 \2", normalized_value)
        normalized_value = re.sub(r'\s*(?:inches?|inch|in\.?|["])\s*$', "", normalized_value, flags=re.IGNORECASE).strip()

        if not normalized_value:
            raise ValueError(f"{label} must be a number like 25.25 or a fraction like 48 3/8.")

        if re.fullmatch(r"[+]?(?:\d+(?:\.\d+)?|\.\d+)", normalized_value):
            parsed_value = float(normalized_value)
        else:
            mixed_fraction_match = re.fullmatch(r"([+]?\d+)\s+(\d+)\s*/\s*(\d+)", normalized_value)
            if mixed_fraction_match:
                whole = int(mixed_fraction_match.group(1))
                numerator = int(mixed_fraction_match.group(2))
                denominator = int(mixed_fraction_match.group(3))
                if denominator == 0:
                    raise ValueError(f"{label} must be a valid fraction with a non-zero denominator.")
                parsed_value = whole + (numerator / denominator)
            else:
                fraction_match = re.fullmatch(r"([+]?\d+)\s*/\s*(\d+)", normalized_value)
                if not fraction_match:
                    raise ValueError(f"{label} must be a number like 25.25 or a fraction like 48 3/8.")
                numerator = int(fraction_match.group(1))
                denominator = int(fraction_match.group(2))
                if denominator == 0:
                    raise ValueError(f"{label} must be a valid fraction with a non-zero denominator.")
                parsed_value = numerator / denominator

    if parsed_value < 0:
        raise ValueError(f"{label} must be zero or greater.")
    return parsed_value


def _normalize_manual_product_dimensions(payload):
    normalized_payload = dict(payload or {})
    for field_name in ("width", "height", "depth"):
        normalized_payload[field_name] = _parse_manual_dimension_value(
            field_name,
            normalized_payload.get(field_name),
        )
    return normalized_payload


ALLOWED_PRODUCT_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
ALLOWED_PRODUCT_IMAGE_MIME = {"image/jpeg", "image/png", "image/gif", "image/webp"}
ALLOWED_PRODUCT_VIDEO_EXTENSIONS = {".mp4", ".m4v", ".mov", ".webm", ".avi", ".mkv", ".mpeg", ".mpg", ".ogv", ".wmv"}
MAX_PRODUCT_IMAGE_BYTES = 20 * 1024 * 1024
MAX_PRODUCT_VIDEO_BYTES = 80 * 1024 * 1024


def _is_allowed_product_upload_extension(extension: str) -> bool:
    normalized_extension = str(extension or "").strip().lower()
    if normalized_extension in ALLOWED_PRODUCT_IMAGE_EXTENSIONS or normalized_extension in ALLOWED_PRODUCT_VIDEO_EXTENSIONS:
        return True

    guessed_mime, _ = mimetypes.guess_type(f"upload{normalized_extension}")
    return bool(guessed_mime and guessed_mime.startswith("video/"))


def _is_video_product_upload_extension(extension: str) -> bool:
    normalized_extension = str(extension or "").strip().lower()
    if normalized_extension in ALLOWED_PRODUCT_VIDEO_EXTENSIONS:
        return True

    guessed_mime, _ = mimetypes.guess_type(f"upload{normalized_extension}")
    return bool(guessed_mime and guessed_mime.startswith("video/"))


@api.post("/admin/product-images/upload")
@require_auth
def upload_product_image():
    """
    POST /api/admin/product-images/upload
    Accepts a single multipart file upload. Saves to /uploads/products/<uuid>.ext
    and returns { image_url: '/uploads/products/<uuid>.ext' }.
    """
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "validation_error", "detail": "No file provided"}), 400

    filename = secure_filename(f.filename or "upload")
    ext = os.path.splitext(filename)[1].lower()
    if not _is_allowed_product_upload_extension(ext):
        return jsonify({"error": "validation_error", "detail": f"Unsupported file type: {ext}"}), 400

    file_bytes = f.read()
    max_file_size = MAX_PRODUCT_VIDEO_BYTES if _is_video_product_upload_extension(ext) else MAX_PRODUCT_IMAGE_BYTES
    if len(file_bytes) > max_file_size:
        max_mb = 80 if max_file_size == MAX_PRODUCT_VIDEO_BYTES else 20
        return jsonify({"error": "validation_error", "detail": f"File is too large (max {max_mb} MB)"}), 400

    uploads_dir = os.path.join(current_app.root_path, "uploads", "products")
    os.makedirs(uploads_dir, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(uploads_dir, unique_name)
    with open(save_path, "wb") as fp:
        fp.write(file_bytes)

    image_url = f"/uploads/products/{unique_name}"
    return jsonify({"image_url": image_url, "image_data": file_bytes.hex()}), 201


@api.post("/manual-products")
@require_auth
def create_manual_product_endpoint():
    init_db()
    payload = request.get_json(silent=True) or {}
    payload["is_active"] = _coerce_bool_value(payload.get("is_active", True))
    payload["quantity"] = _resolve_manual_product_quantity(
        payload.get("quantity"),
        _coerce_bool_value(payload.get("is_digital_download")),
    )
    try:
        payload = _normalize_manual_product_dimensions(payload)
    except ValueError as exc:
        return jsonify({"error": "invalid_dimension", "detail": str(exc)}), 400
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
        _catalog_cache_invalidate("manual_products", "manual_products_summary")
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
    merged_payload = {
        "name": product.get("name"),
        "description": product.get("description"),
        "category": product.get("category"),
        "materials": product.get("materials"),
        "width": product.get("width"),
        "height": product.get("height"),
        "depth": product.get("depth"),
        "price": product.get("price"),
        "old_price": product.get("old_price"),
        "discount_percent": product.get("discount_percent"),
        "quantity": product.get("quantity"),
        "is_featured": product.get("is_featured"),
        "is_active": product.get("is_active", True),
        "is_digital_download": product.get("is_digital_download"),
        "related_links": product.get("related_links"),
    }
    if "images" in payload:
        merged_payload["images"] = payload.get("images")
    merged_payload.update(payload)
    merged_payload["is_active"] = _coerce_bool_value(merged_payload.get("is_active", True))
    merged_payload["quantity"] = _resolve_manual_product_quantity(
        merged_payload.get("quantity"),
        _coerce_bool_value(merged_payload.get("is_digital_download")),
    )
    try:
        merged_payload = _normalize_manual_product_dimensions(merged_payload)
    except ValueError as exc:
        return jsonify({"error": "invalid_dimension", "detail": str(exc)}), 400

    if not merged_payload.get("name"):
        return jsonify({"error": "missing_name"}), 400
    if not merged_payload.get("description"):
        return jsonify({"error": "missing_description"}), 400
    if merged_payload.get("price") is None:
        return jsonify({"error": "missing_price"}), 400
    if merged_payload.get("quantity") is None:
        return jsonify({"error": "missing_quantity"}), 400
    try:
        update_manual_product(product_id, merged_payload)
        updated_product = fetch_manual_product(product_id)
        _catalog_cache_invalidate("manual_products", "manual_products_summary")
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
        _catalog_cache_invalidate("manual_products", "manual_products_summary")
        return jsonify({"success": True, "message": "Product deleted"}), 200
    except Exception as exc:
        return jsonify({"error": "deletion_failed", "detail": str(exc)}), 500


@api.post("/admin/manual-products/<int:product_id>/facebook-post")
@require_auth
def publish_manual_product_to_facebook_page(product_id):
    init_db()
    if not _is_admin_request():
        return jsonify({"error": "forbidden"}), 403

    product = fetch_manual_product(product_id)
    if not product:
        return jsonify({"error": "not_found"}), 404

    page_id = (os.environ.get("FACEBOOK_PAGE_ID") or "").strip()
    access_token = (os.environ.get("FACEBOOK_PAGE_ACCESS_TOKEN") or "").strip()
    if not page_id or not access_token:
        return jsonify({
            "error": "facebook_not_configured",
            "detail": "Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN to enable direct Facebook page posting.",
        }), 503

    product_link = _build_manual_product_public_link(product_id)
    posted = _post_manual_product_to_facebook_page(
        product=product,
        product_link=product_link,
        page_id=page_id,
        access_token=access_token,
    )
    if not posted.get("ok"):
        return jsonify({
            "error": posted.get("error") or "facebook_post_failed",
            "detail": posted.get("detail") or "Unable to publish to Facebook page.",
        }), int(posted.get("status") or 502)

    return jsonify({
        "success": True,
        "post_id": posted.get("post_id"),
        "product_id": product_id,
        "product_link": product_link,
    }), 200
