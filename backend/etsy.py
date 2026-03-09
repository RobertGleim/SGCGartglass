import json
import os
import re
import time
import urllib.error
import urllib.request
from urllib.parse import parse_qs, quote, urlparse


LISTING_PATH = "/listings/"
SHOP_FAVORITERS_URL = os.environ.get(
    "ETSY_SHOP_FAVORITERS_URL",
    "https://www.etsy.com/shop/SGCGArtGlass/favoriters?ref=shop_home",
)
ETSY_SHOP_NAME = os.environ.get("ETSY_SHOP_NAME", "SGCGArtGlass")
_SHOP_FAVORERS_CACHE = {"value": None, "expires_at": 0}
_SHOP_FAVORERS_TTL_SECONDS = int(os.environ.get("ETSY_SHOP_FAVORERS_TTL_SECONDS", "300"))


def extract_listing_id(value):
    if value is None:
        return None
    value = str(value).strip()
    if not value:
        return None
    if value.isdigit():
        return value

    parsed = urlparse(value)
    if parsed.scheme and parsed.netloc:
        query = parse_qs(parsed.query)
        for key in ("listing_id", "listingId"):
            if key in query and query[key]:
                listing_candidate = query[key][0].strip()
                if listing_candidate.isdigit():
                    return listing_candidate

    # Handle seller dashboard URLs: /listing-editor/edit/1812320210
    match = re.search(r"/listing-editor/edit/(\d+)", value)
    if match:
        return match.group(1)
    # Handle public listing URLs: /listing/1812320210 or /listings/1812320210
    match = re.search(r"/listings?/(\d+)", value)
    if match:
        return match.group(1)
    # Handle query-style parameters in raw strings.
    match = re.search(r"listing[_-]?id=(\d+)", value)
    if match:
        return match.group(1)
    # Fallback: extract any digits
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
        raise RuntimeError("ETSY_API_KEY must be configured")

    # Etsy API requires x-api-key header using the API key string.
    url = f"{base_url}{LISTING_PATH}{listing_id}?includes=Images"
    headers = {"x-api-key": api_key}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"

    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8")
        except Exception:
            body = ""

        detail = ""
        if body:
            try:
                error_payload = json.loads(body)
            except json.JSONDecodeError:
                error_payload = None
            if isinstance(error_payload, dict):
                detail = (
                    error_payload.get("error")
                    or error_payload.get("message")
                    or error_payload.get("error_description")
                    or ""
                )
                if not detail and error_payload.get("errors"):
                    detail = str(error_payload.get("errors"))
            elif body:
                detail = body.strip()

        if not detail:
            detail = exc.reason or "Etsy API request failed"
        raise RuntimeError(f"etsy_api_error:{exc.code}:{detail}") from exc

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


def _extract_first_match(patterns, text):
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            continue
        raw = (match.group(1) or "").replace(",", "").strip()
        if raw.isdigit():
            return int(raw)
    return None


def _parse_shop_favorers_count(html_text):
    # Try explicit JSON fields first if Etsy includes them in page state.
    json_style_patterns = [
        r'"favorer_count"\s*:\s*(\d+)',
        r'"admirer_count"\s*:\s*(\d+)',
        r'"favorers_count"\s*:\s*(\d+)',
    ]
    parsed = _extract_first_match(json_style_patterns, html_text)
    if parsed is not None:
        return parsed

    # Fallback to human-readable strings rendered in HTML.
    rendered_patterns = [
        r'([\d,]+)\s+Admirers',
        r'([\d,]+)\s+admirers',
        r'([\d,]+)\s+Favoriters',
        r'([\d,]+)\s+favoriters',
        r'([\d,]+)\s+favorites',
    ]
    parsed = _extract_first_match(rendered_patterns, html_text)
    if parsed is not None:
        return parsed

    raise RuntimeError("etsy_shop_favorers_parse_error")


def _extract_num_favorers_from_payload(payload):
    if isinstance(payload, dict):
        for key in ("num_favorers", "favorer_count", "admirer_count", "favorers_count"):
            raw = payload.get(key)
            if isinstance(raw, (int, float)):
                return int(raw)
            if isinstance(raw, str) and raw.replace(",", "").isdigit():
                return int(raw.replace(",", ""))

        for key in ("results", "shops", "data"):
            nested = payload.get(key)
            found = _extract_num_favorers_from_payload(nested)
            if found is not None:
                return found

    if isinstance(payload, list):
        for entry in payload:
            found = _extract_num_favorers_from_payload(entry)
            if found is not None:
                return found

    return None


def _fetch_shop_favorers_count_via_api():
    api_key = os.environ.get("ETSY_API_KEY")
    if not api_key:
        return None

    base_url = os.environ.get("ETSY_API_BASE", "https://openapi.etsy.com/v3/application").rstrip("/")
    shop_name = quote(str(ETSY_SHOP_NAME or "SGCGArtGlass").strip())
    access_token = os.environ.get("ETSY_ACCESS_TOKEN")
    headers = {"x-api-key": api_key}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"

    candidate_urls = [
        f"{base_url}/shops/{shop_name}",
        f"{base_url}/shops?shop_name={shop_name}",
        f"{base_url}/users/{shop_name}/shops",
    ]

    for url in candidate_urls:
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except Exception:
            continue

        parsed = _extract_num_favorers_from_payload(payload)
        if parsed is not None:
            return int(parsed)

    return None


def fetch_shop_favorers_count(force_refresh=False):
    now = time.time()
    if not force_refresh:
        cached = _SHOP_FAVORERS_CACHE.get("value")
        expires_at = float(_SHOP_FAVORERS_CACHE.get("expires_at") or 0)
        if cached is not None and now < expires_at:
            return {
                "total": int(cached),
                "source_url": SHOP_FAVORITERS_URL,
                "cached": True,
            }

    total = _fetch_shop_favorers_count_via_api()
    scrape_error = None

    if total is None:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            " (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }

        req = urllib.request.Request(SHOP_FAVORITERS_URL, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                html_text = response.read().decode("utf-8", errors="ignore")
            total = _parse_shop_favorers_count(html_text)
        except urllib.error.HTTPError as exc:
            scrape_error = f"etsy_shop_favorers_http_error:{exc.code}"
        except urllib.error.URLError as exc:
            scrape_error = f"etsy_shop_favorers_network_error:{exc.reason}"
        except Exception as exc:
            scrape_error = str(exc)

    if total is None:
        cached = _SHOP_FAVORERS_CACHE.get("value")
        if cached is not None:
            return {
                "total": int(cached),
                "source_url": SHOP_FAVORITERS_URL,
                "cached": True,
                "stale": True,
            }
        raise RuntimeError(scrape_error or "etsy_shop_favorers_unavailable")

    _SHOP_FAVORERS_CACHE["value"] = int(total)
    _SHOP_FAVORERS_CACHE["expires_at"] = now + max(30, _SHOP_FAVORERS_TTL_SECONDS)
    return {
        "total": int(total),
        "source_url": SHOP_FAVORITERS_URL,
        "cached": False,
    }
