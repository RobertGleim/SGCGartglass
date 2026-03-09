"""
Template business logic: SVG parsing, validation, thumbnail generation.
"""
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Optional

# SVG namespace: path elements are often in default or svg namespace
SVG_NS = {"svg": "http://www.w3.org/2000/svg"}
ID_ATTR = "id"
ID_ATTR_NS = "{http://www.w3.org/1999/xlink}href"  # xlink:href for references


def _local_tag(elem: ET.Element) -> str:
    """Return local tag name without namespace."""
    tag = elem.tag if isinstance(elem.tag, str) else ""
    return tag.split("}")[-1] if "}" in tag else tag


def _get_id(elem: ET.Element) -> Optional[str]:
    """Get element id from id attribute (or from href #fragment for use elements)."""
    aid = elem.get(ID_ATTR)
    if aid:
        return aid.strip()
    href = elem.get(ID_ATTR_NS) or elem.get("href")
    if href and isinstance(href, str) and href.startswith("#"):
        return href[1:].strip()
    return None


def parse_svg_regions(svg_content: str) -> tuple[list[dict[str, Any]], Optional[str]]:
    """
    Extract region ids from SVG content: find all <path> elements with id attributes.
    Returns (list of {"region_id": str, "display_order": int}, error_message).
    If error_message is not None, the list may be empty and the SVG is invalid.
    """
    if not svg_content or not isinstance(svg_content, str):
        return [], "SVG content is required"
    content = svg_content.strip()
    if not content:
        return [], "SVG content is empty"
    # Basic XML well-formedness
    try:
        root = ET.fromstring(content)
    except ET.ParseError as e:
        return [], f"Invalid XML: {e!s}"
    # Collect path ids; preserve document order
    seen: set[str] = set()
    regions: list[dict[str, Any]] = []
    for idx, elem in enumerate(root.iter()):
        if _local_tag(elem) != "path":
            continue
        rid = _get_id(elem)
        if rid:
            if rid in seen:
                return [], f"Duplicate path id: {rid!r}"
            if not re.match(r"^[a-zA-Z0-9_\-]+$", rid):
                return [], f"Invalid path id (use alphanumeric, hyphen, underscore): {rid!r}"
            seen.add(rid)
            regions.append({"region_id": rid, "display_order": idx})
    if not regions:
        return [], "No <path> elements with id attributes found"
    return regions, None


# Alias for API consistency
parse_svg_file = parse_svg_regions


def validate_template_data(data: Any) -> tuple[bool, dict[str, Any], str]:
    """
    Validate template create/update form data.
    Returns (ok, normalized_data, error_message).
    normalized_data is only valid when ok is True.
    """
    if data is None:
        return False, {}, "Request body is required"
    if not isinstance(data, dict):
        return False, {}, "Request body must be a JSON object"
    payload = {k: v for k, v in data.items() if v is not None}
    name = (payload.get("name") or "").strip()
    if not name:
        return False, {}, "name is required"
    if len(name) > 255:
        return False, {}, "name must be at most 255 characters"
    description = payload.get("description")
    if description is not None and not isinstance(description, str):
        description = str(description)
    elif description is not None:
        description = description.strip() or None
    category = payload.get("category")
    if category is not None:
        if not isinstance(category, str):
            category = str(category).strip() if category else None
        else:
            category = category.strip() or None
        if category and len(category) > 100:
            return False, {}, "category must be at most 100 characters"
    svg_content = payload.get("svg_content")
    if svg_content is not None and not isinstance(svg_content, str):
        return False, {}, "svg_content must be a string"
    if svg_content is not None:
        svg_content = svg_content.strip()
        if not svg_content:
            svg_content = None  # treat empty as absent (image-based template)
        else:
            regions, err = parse_svg_regions(svg_content)
            if err:
                return False, {}, err

    image_url = payload.get("image_url")
    if image_url is not None:
        if not isinstance(image_url, str):
            return False, {}, "image_url must be a string"
        image_url = image_url.strip() or None
        if image_url and len(image_url) > 500:
            return False, {}, "image_url must be at most 500 characters"

    template_type = payload.get("template_type", "svg")
    if template_type not in ("svg", "image"):
        template_type = "svg" if svg_content else "image"
    thumbnail_url = payload.get("thumbnail_url")
    if thumbnail_url is not None:
        if not isinstance(thumbnail_url, str):
            return False, {}, "thumbnail_url must be a string"
        thumbnail_url = thumbnail_url.strip() or None
        if thumbnail_url and len(thumbnail_url) > 500:
            return False, {}, "thumbnail_url must be at most 500 characters"
    is_active = payload.get("is_active")
    if is_active is not None:
        if isinstance(is_active, bool):
            pass
        elif isinstance(is_active, str):
            is_active = is_active.strip().lower() in ("1", "true", "yes")
        else:
            is_active = bool(is_active)
    else:
        is_active = True

    difficulty = payload.get("difficulty")
    if difficulty is not None:
        difficulty = str(difficulty).strip() or None
        if difficulty and len(difficulty) > 50:
            difficulty = difficulty[:50]

    dimensions = payload.get("dimensions")
    if dimensions is not None:
        dimensions = str(dimensions).strip() or None
        if dimensions and len(dimensions) > 100:
            dimensions = dimensions[:100]

    piece_count = payload.get("piece_count")
    if piece_count is not None:
        try:
            piece_count = int(piece_count)
            if piece_count < 0:
                piece_count = 0
        except (ValueError, TypeError):
            piece_count = None

    default_design_data = payload.get("default_design_data")
    if default_design_data is not None:
        if not isinstance(default_design_data, dict):
            return False, {}, "default_design_data must be an object"
        normalized_default_design_data = {}

        if "floodFill" in default_design_data:
            normalized_default_design_data["floodFill"] = bool(default_design_data.get("floodFill"))

        data_url = default_design_data.get("dataUrl")
        if data_url is not None:
            if not isinstance(data_url, str):
                return False, {}, "default_design_data.dataUrl must be a string"
            data_url = data_url.strip()
            if data_url:
                normalized_default_design_data["dataUrl"] = data_url

        preview_url = default_design_data.get("preview_url")
        if preview_url is not None:
            if not isinstance(preview_url, str):
                return False, {}, "default_design_data.preview_url must be a string"
            preview_url = preview_url.strip()
            if preview_url:
                normalized_default_design_data["preview_url"] = preview_url

        sections = default_design_data.get("sections")
        if sections is not None and not isinstance(sections, dict):
            return False, {}, "default_design_data.sections must be an object"
        if isinstance(sections, dict):
            normalized_sections = {}
            for section_id, section_value in sections.items():
                if not isinstance(section_id, str) or not section_id.strip():
                    return False, {}, "default_design_data.sections has invalid section id"
                if not isinstance(section_value, dict):
                    return False, {}, f"default_design_data.sections[{section_id!r}] must be an object"
                normalized_entry = {}
                if "color" in section_value and section_value["color"] is not None:
                    if not isinstance(section_value["color"], str):
                        return False, {}, f"default_design_data.sections[{section_id!r}].color must be a string"
                    normalized_entry["color"] = section_value["color"].strip()
                if "glassType" in section_value and section_value["glassType"] is not None:
                    normalized_entry["glassType"] = str(section_value["glassType"]).strip()
                if "glassTypeId" in section_value and section_value["glassTypeId"] is not None:
                    try:
                        normalized_entry["glassTypeId"] = int(section_value["glassTypeId"])
                    except (ValueError, TypeError):
                        return False, {}, f"default_design_data.sections[{section_id!r}].glassTypeId must be an integer"
                if "sectionNum" in section_value and section_value["sectionNum"] is not None:
                    try:
                        normalized_entry["sectionNum"] = int(section_value["sectionNum"])
                    except (ValueError, TypeError):
                        return False, {}, f"default_design_data.sections[{section_id!r}].sectionNum must be an integer"
                normalized_entry["locked"] = bool(section_value.get("locked", False))
                normalized_sections[section_id.strip()] = normalized_entry
            normalized_default_design_data["sections"] = normalized_sections

        if normalized_default_design_data:
            default_design_data = normalized_default_design_data
        else:
            default_design_data = None

    is_private = payload.get("is_private")
    if is_private is not None:
        if isinstance(is_private, bool):
            pass
        elif isinstance(is_private, str):
            is_private = is_private.strip().lower() in ("1", "true", "yes", "on")
        else:
            is_private = bool(is_private)
    else:
        is_private = False

    assigned_customer_id = payload.get("assigned_customer_id")
    if assigned_customer_id is not None and assigned_customer_id != "":
        try:
            assigned_customer_id = int(assigned_customer_id)
            if assigned_customer_id <= 0:
                return False, {}, "assigned_customer_id must be a positive integer"
        except (ValueError, TypeError):
            return False, {}, "assigned_customer_id must be an integer"
    else:
        assigned_customer_id = None

    if not is_private:
        assigned_customer_id = None

    related_links = payload.get("related_links")
    if related_links is not None:
        if not isinstance(related_links, dict):
            return False, {}, "related_links must be an object"

        def _parse_optional_int(value: Any, field_name: str) -> Optional[int]:
            if value in (None, ""):
                return None
            try:
                parsed = int(value)
            except (ValueError, TypeError):
                raise ValueError(f"related_links.{field_name} must be an integer")
            if parsed <= 0:
                raise ValueError(f"related_links.{field_name} must be a positive integer")
            return parsed

        try:
            normalized_related_links = {
                "template_id": _parse_optional_int(related_links.get("template_id"), "template_id"),
                "template_name": str(related_links.get("template_name") or "").strip() or None,
                "pattern_product_id": _parse_optional_int(related_links.get("pattern_product_id"), "pattern_product_id"),
                "pattern_product_name": str(related_links.get("pattern_product_name") or "").strip() or None,
                "gallery_photo_id": _parse_optional_int(related_links.get("gallery_photo_id"), "gallery_photo_id"),
                "gallery_panel_name": str(related_links.get("gallery_panel_name") or "").strip() or None,
                "gallery_template_id": _parse_optional_int(related_links.get("gallery_template_id"), "gallery_template_id"),
            }
        except ValueError as exc:
            return False, {}, str(exc)

        has_any_related_value = any(
            value not in (None, "")
            for value in normalized_related_links.values()
        )
        related_links = normalized_related_links if has_any_related_value else None

    normalized = {
        "name": name,
        "description": description,
        "category": category,
        "is_active": is_active,
        "thumbnail_url": thumbnail_url,
        "difficulty": difficulty,
        "dimensions": dimensions,
        "piece_count": piece_count,
        "template_type": template_type,
        "image_url": image_url,
        "default_design_data": default_design_data,
        "related_links": related_links,
        "is_private": is_private,
        "assigned_customer_id": assigned_customer_id,
    }
    if svg_content is not None:
        normalized["svg_content"] = svg_content
    return True, normalized, ""


def generate_thumbnail_png(
    svg_content: Optional[str] = None,
    svg_path: Optional[str | Path] = None,
    width: int = 300,
    height: int = 300,
) -> Optional[bytes]:
    """
    Render SVG to a 300x300 PNG (or width x height).
    Accepts either svg_content (string) or svg_path (file path).
    Returns PNG bytes, or None if rendering is not available (e.g. cairosvg not installed).
    """
    content: Optional[str] = None
    if svg_content:
        content = svg_content.strip() if isinstance(svg_content, str) else None
    elif svg_path:
        path = Path(svg_path)
        if path.is_file():
            try:
                content = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                return None
    if not content:
        return None
    try:
        import cairosvg
    except ImportError:
        return None
    try:
        return cairosvg.svg2png(
            bytestring=content.encode("utf-8"),
            output_width=width,
            output_height=height,
        )
    except Exception:
        return None
