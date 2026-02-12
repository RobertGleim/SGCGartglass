import json
import os
import re
import urllib.error
import urllib.request


LISTING_PATH = "/listings/"


def extract_listing_id(value):
    if not value:
        return None
    value = value.strip()
    if value.isdigit():
        return value
    match = re.search(r"/listing/(\d+)", value)
    if match:
        return match.group(1)
    digits = re.findall(r"(\d+)", value)
    return digits[-1] if digits else None


def _format_price(price):
    if isinstance(price, dict):
        amount = price.get("amount")
        divisor = price.get("divisor", 100)
        currency = price.get("currency_code")
        if amount is not None:
            return f"{float(amount) / float(divisor):.2f}", currency
    if isinstance(price, str):
        return price, None
    return None, None


def fetch_listing(listing_id):
    api_key = os.environ.get("ETSY_API_KEY")
    base_url = os.environ.get("ETSY_API_BASE", "https://openapi.etsy.com/v3/application")
    access_token = os.environ.get("ETSY_ACCESS_TOKEN")
    if not api_key:
        raise RuntimeError("ETSY_API_KEY not configured")

    url = f"{base_url}{LISTING_PATH}{listing_id}?includes=images"
    headers = {"x-api-key": api_key}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"

    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"etsy_api_error:{exc.code}") from exc

    title = payload.get("title")
    description = payload.get("description")
    price_amount, price_currency = _format_price(payload.get("price"))
    images = payload.get("images") or []
    image_url = None
    if images:
        image_url = images[0].get("url_fullxfull") or images[0].get("url_570xN")

    return {
        "etsy_listing_id": listing_id,
        "title": title,
        "description": description,
        "price_amount": price_amount,
        "price_currency": price_currency,
        "image_url": image_url,
        "etsy_url": payload.get("url"),
    }
