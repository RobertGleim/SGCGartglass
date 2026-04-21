from __future__ import annotations

from collections import deque
from io import BytesIO
from math import cos, floor, hypot, pi, sin

from PIL import Image, ImageDraw, ImageFont


CANVAS_WIDTH = 840
CANVAS_HEIGHT = 600
BACKGROUND_RGB = (248, 244, 239)
LINE_LUMINANCE_THRESHOLD = 208
MIN_LINE_COMPONENT_PIXELS = 10
MAX_EXISTING_LABEL_COMPONENT_PIXELS = 140
MAX_EXISTING_LABEL_BOX_PX = 24


def _get_fitted_section_label_font_px(section_number, width, height, clearance_px=None):
    digits = len(str(section_number or "")) or 1
    safe_width = max(1.0, float(width or 1))
    safe_height = max(1.0, float(height or 1))
    max_by_height = safe_height * 0.34
    max_by_width = (safe_width * 0.78) / max(1.0, digits * 0.92)
    if clearance_px is not None:
        max_by_clearance = max(2.0, float(clearance_px) * 1.1)
    else:
        max_by_clearance = 10.0
    return max(4.0, min(18.0, max_by_height, max_by_width, max_by_clearance))


def _get_stable_section_order(regions):
    if not regions:
        return []
    canvas_h = float(regions[0].get("canvasH") or CANVAS_HEIGHT)
    row_tolerance = max(4.0, canvas_h * 0.02)

    def _sort_key(region):
        cx = float(region.get("cx") or 0)
        cy = float(region.get("cy") or 0)
        return (
            round(cy / row_tolerance),
            round(cx, 3),
            round(cy, 3),
            str(region.get("id") or ""),
        )

    return sorted(regions, key=_sort_key)


def _estimate_clearance_at_point(x, y, left, top, right, bottom, is_inside, max_step=22):
    directions = (
        (1.0, 0.0),
        (-1.0, 0.0),
        (0.0, 1.0),
        (0.0, -1.0),
        (0.707, 0.707),
        (0.707, -0.707),
        (-0.707, 0.707),
        (-0.707, -0.707),
    )
    min_reach = max_step
    for dx, dy in directions:
        reach = 0
        for step in range(1, max_step + 1):
            px = x + (dx * step)
            py = y + (dy * step)
            if px < left or px > right or py < top or py > bottom or not is_inside(px, py):
                reach = step - 1
                break
            reach = step
        min_reach = min(min_reach, reach)
    return max(0, min_reach)


def _get_best_interior_point(left, top, right, bottom, fallback_x, fallback_y, is_inside):
    width = max(1.0, right - left)
    height = max(1.0, bottom - top)
    max_step = max(8, min(26, floor(min(width, height) * 0.45)))
    best = None
    for row in range(9):
        for col in range(9):
            x = left + ((col + 0.5) / 9.0) * width
            y = top + ((row + 0.5) / 9.0) * height
            if not is_inside(x, y):
                continue
            clearance_px = _estimate_clearance_at_point(x, y, left, top, right, bottom, is_inside, max_step)
            dist_sq = ((x - fallback_x) ** 2) + ((y - fallback_y) ** 2)
            if (
                best is None
                or clearance_px > best["clearancePx"]
                or (clearance_px == best["clearancePx"] and dist_sq < best["distSq"])
            ):
                best = {"x": x, "y": y, "clearancePx": clearance_px, "distSq": dist_sq}
    if best is not None:
        return {"x": best["x"], "y": best["y"], "clearancePx": best["clearancePx"]}
    return {"x": fallback_x, "y": fallback_y, "clearancePx": 0}


def _get_anchor_from_region_pixels(pixels, region_id, region_map, canvas_width, canvas_height, preferred_x, preferred_y):
    if not pixels or canvas_width <= 0:
        return {"x": preferred_x, "y": preferred_y, "clearancePx": 0}

    min_x = canvas_width
    min_y = canvas_height
    max_x = 0
    max_y = 0
    for pixel_index in pixels:
        x = pixel_index % canvas_width
        y = pixel_index // canvas_width
        min_x = min(min_x, x)
        min_y = min(min_y, y)
        max_x = max(max_x, x)
        max_y = max(max_y, y)

    def is_inside(x, y):
        ix = round(x)
        iy = round(y)
        if ix < 0 or iy < 0 or ix >= canvas_width or iy >= canvas_height:
            return False
        return region_map[(iy * canvas_width) + ix] == region_id

    return _get_best_interior_point(min_x, min_y, max_x, max_y, preferred_x, preferred_y, is_inside)


def _spread_section_label_positions(labels):
    if len(labels) < 2:
        return labels

    def clamp_label(label, x, y):
        base_x = float(label.get("baseCx", label.get("cx", 0)) or 0)
        base_y = float(label.get("baseCy", label.get("cy", 0)) or 0)
        width = max(1.0, float(label.get("w") or 1))
        height = max(1.0, float(label.get("h") or 1))
        max_dx = max(2.0, width * 0.34)
        max_dy = max(2.0, height * 0.34)
        next_x = max(base_x - max_dx, min(base_x + max_dx, x))
        next_y = max(base_y - max_dy, min(base_y + max_dy, y))

        bounds = [label.get("left"), label.get("top"), label.get("right"), label.get("bottom")]
        if all(value is not None for value in bounds):
            left = float(label["left"])
            top = float(label["top"])
            right = float(label["right"])
            bottom = float(label["bottom"])
            digits = len(str(label.get("num") or "")) or 1
            font_px = max(2.0, float(label.get("fontPx") or 6))
            label_half_w = (font_px * 0.62 * digits) / 2.0
            label_half_h = (font_px * 0.58) / 2.0
            pad_x = min(10.0, max(1.0, width * 0.12, label_half_w + 0.8))
            pad_y = min(10.0, max(1.0, height * 0.12, label_half_h + 0.8))
            min_x = left + pad_x
            max_x = right - pad_x
            min_y = top + pad_y
            max_y = bottom - pad_y
            if min_x <= max_x:
                next_x = max(min_x, min(max_x, next_x))
            if min_y <= max_y:
                next_y = max(min_y, min(max_y, next_y))

        return next_x, next_y

    arranged = []
    for label in labels:
        clone = dict(label)
        clone["baseCx"] = float(clone.get("cx") or 0)
        clone["baseCy"] = float(clone.get("cy") or 0)
        clone["cx"] = float(clone.get("cx") or 0)
        clone["cy"] = float(clone.get("cy") or 0)
        arranged.append(clone)

    for _ in range(14):
        for index in range(len(arranged)):
            for other_index in range(index + 1, len(arranged)):
                first = arranged[index]
                second = arranged[other_index]
                dx = float(second["cx"] - first["cx"])
                dy = float(second["cy"] - first["cy"])
                distance = hypot(dx, dy)
                first_size = max(4.0, float(first.get("fontPx") or 6))
                second_size = max(4.0, float(second.get("fontPx") or 6))
                min_distance = max(8.0, (first_size + second_size) * 0.8)
                if distance >= min_distance:
                    continue

                overlap = (min_distance - max(0.001, distance)) * 0.5
                if distance > 0.001:
                    unit_x = dx / distance
                    unit_y = dy / distance
                else:
                    seed = ((int(first.get("num") or (index + 1)) * 73) + (int(second.get("num") or (other_index + 1)) * 37)) % 360
                    theta = seed * (pi / 180.0)
                    unit_x = cos(theta)
                    unit_y = sin(theta)

                first["cx"], first["cy"] = clamp_label(first, first["cx"] - (unit_x * overlap), first["cy"] - (unit_y * overlap))
                second["cx"], second["cy"] = clamp_label(second, second["cx"] + (unit_x * overlap), second["cy"] + (unit_y * overlap))

    return arranged


def _is_dark_line_pixel(red, green, blue):
    luminance = (0.299 * red) + (0.587 * green) + (0.114 * blue)
    return luminance <= LINE_LUMINANCE_THRESHOLD


def _collect_dark_components(mask, width, height):
    if not mask:
        return []

    components = []
    visited = [False] * (width * height)
    neighbor_offsets = (-1, 1, -width, width, -width - 1, -width + 1, width - 1, width + 1)

    for start_index, value in enumerate(mask):
        if not value or visited[start_index]:
            continue

        queue = deque([start_index])
        visited[start_index] = True
        pixels = []
        min_x = width
        min_y = height
        max_x = 0
        max_y = 0

        while queue:
            current = queue.pop()
            pixels.append(current)
            x = current % width
            y = current // width
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)

            for offset in neighbor_offsets:
                neighbor = current + offset
                if neighbor < 0 or neighbor >= width * height or visited[neighbor] or not mask[neighbor]:
                    continue
                nx = neighbor % width
                ny = neighbor // width
                if abs(nx - x) > 1 or abs(ny - y) > 1:
                    continue
                visited[neighbor] = True
                queue.append(neighbor)

        components.append(
            {
                "pixels": pixels,
                "area": len(pixels),
                "left": min_x,
                "top": min_y,
                "right": max_x,
                "bottom": max_y,
            }
        )

    return components


def _filter_small_line_components(mask, width, height, min_pixels=MIN_LINE_COMPONENT_PIXELS):
    if not mask:
        return mask

    filtered = [0] * (width * height)
    for component in _collect_dark_components(mask, width, height):
        if component["area"] >= min_pixels:
            for pixel_index in component["pixels"]:
                filtered[pixel_index] = 1

    return filtered


def _erase_existing_label_components(image):
    width, height = image.size
    pixel_access = image.load()
    dark_mask = [0] * (width * height)
    for y in range(height):
        row_offset = y * width
        for x in range(width):
            red, green, blue = pixel_access[x, y]
            if _is_dark_line_pixel(red, green, blue):
                dark_mask[row_offset + x] = 1

    for component in _collect_dark_components(dark_mask, width, height):
        component_width = component["right"] - component["left"] + 1
        component_height = component["bottom"] - component["top"] + 1
        if (
            component["area"] > MAX_EXISTING_LABEL_COMPONENT_PIXELS
            or component_width > MAX_EXISTING_LABEL_BOX_PX
            or component_height > MAX_EXISTING_LABEL_BOX_PX
        ):
            continue

        pad = 2
        left = max(0, component["left"] - pad)
        top = max(0, component["top"] - pad)
        right = min(width - 1, component["right"] + pad)
        bottom = min(height - 1, component["bottom"] + pad)
        for y in range(top, bottom + 1):
            for x in range(left, right + 1):
                pixel_access[x, y] = BACKGROUND_RGB

    return image


def _expand_line_mask(mask, width, height):
    if not mask:
        return mask

    expanded = list(mask)
    for index, value in enumerate(mask):
        if not value:
            continue
        x = index % width
        y = index // width
        for dy in (-1, 0, 1):
            ny = y + dy
            if ny < 0 or ny >= height:
                continue
            row_offset = ny * width
            for dx in (-1, 0, 1):
                nx = x + dx
                if nx < 0 or nx >= width:
                    continue
                expanded[row_offset + nx] = 1
    return expanded


def _build_line_mask(pixel_access, width, height):
    mask = [0] * (width * height)
    for y in range(height):
        row_offset = y * width
        for x in range(width):
            red, green, blue = pixel_access[x, y]
            if _is_dark_line_pixel(red, green, blue):
                mask[row_offset + x] = 1

    cleaned = _filter_small_line_components(mask, width, height)
    return _expand_line_mask(cleaned, width, height)


def _render_clean_line_art(image):
    width, height = image.size
    cleaned = Image.new("RGB", (width, height), BACKGROUND_RGB)
    source_pixels = image.load()
    output_pixels = cleaned.load()
    for y in range(height):
        for x in range(width):
            red, green, blue = source_pixels[x, y]
            if _is_dark_line_pixel(red, green, blue):
                output_pixels[x, y] = (17, 17, 17)
    return cleaned


def _build_region_map(mask, width, height):
    region_map = [0] * (width * height)
    region_pixels = {}
    next_region_id = 1
    for y in range(height):
        for x in range(width):
            pixel_index = (y * width) + x
            if region_map[pixel_index] != 0 or mask[pixel_index]:
                continue
            region_id = next_region_id
            next_region_id += 1
            queue = deque([pixel_index])
            region_map[pixel_index] = region_id
            pixels = []
            while queue:
                current = queue.pop()
                pixels.append(current)
                cx = current % width
                cy = current // width
                if cx > 0:
                    neighbor = current - 1
                    if region_map[neighbor] == 0 and not mask[neighbor]:
                        region_map[neighbor] = region_id
                        queue.append(neighbor)
                if cx < width - 1:
                    neighbor = current + 1
                    if region_map[neighbor] == 0 and not mask[neighbor]:
                        region_map[neighbor] = region_id
                        queue.append(neighbor)
                if cy > 0:
                    neighbor = current - width
                    if region_map[neighbor] == 0 and not mask[neighbor]:
                        region_map[neighbor] = region_id
                        queue.append(neighbor)
                if cy < height - 1:
                    neighbor = current + width
                    if region_map[neighbor] == 0 and not mask[neighbor]:
                        region_map[neighbor] = region_id
                        queue.append(neighbor)
            region_pixels[region_id] = pixels
    return region_map, region_pixels


def _collect_numbered_regions(region_map, region_pixels, canvas_width, canvas_height):
    border_regions = set()
    for region_id, pixels in region_pixels.items():
        min_x = canvas_width
        min_y = canvas_height
        max_x = 0
        max_y = 0
        for pixel_index in pixels:
            x = pixel_index % canvas_width
            y = pixel_index // canvas_width
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
        edges_touched = sum(
            (
                min_x <= 2,
                min_y <= 2,
                max_x >= canvas_width - 3,
                max_y >= canvas_height - 3,
            )
        )
        if edges_touched >= 2:
            border_regions.add(region_id)

    raw_regions = []
    for region_id, pixels in region_pixels.items():
        if len(pixels) < 3 or region_id in border_regions:
            continue
        sum_x = 0.0
        sum_y = 0.0
        min_x = canvas_width
        min_y = canvas_height
        max_x = 0
        max_y = 0
        for pixel_index in pixels:
            x = pixel_index % canvas_width
            y = pixel_index // canvas_width
            sum_x += x
            sum_y += y
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
        center_x = sum_x / len(pixels)
        center_y = sum_y / len(pixels)
        anchor = _get_anchor_from_region_pixels(pixels, region_id, region_map, canvas_width, canvas_height, center_x, center_y)
        raw_regions.append(
            {
                "id": region_id,
                "cx": center_x,
                "cy": center_y,
                "labelX": anchor["x"],
                "labelY": anchor["y"],
                "clearancePx": anchor["clearancePx"],
                "left": min_x,
                "top": min_y,
                "right": max_x,
                "bottom": max_y,
                "area": len(pixels),
                "w": max_x - min_x,
                "h": max_y - min_y,
                "canvasW": canvas_width,
                "canvasH": canvas_height,
            }
        )

    canvas_area = canvas_width * canvas_height
    filtered_regions = []
    for region in raw_regions:
        if region["area"] < canvas_area * 0.6:
            filtered_regions.append(region)
            continue
        contained = 0
        for other in raw_regions:
            if other is region:
                continue
            if other["cx"] > region["left"] and other["cx"] < region["right"] and other["cy"] > region["top"] and other["cy"] < region["bottom"]:
                contained += 1
                if contained >= 2:
                    break
        if contained < 2:
            filtered_regions.append(region)

    labels = []
    for index, region in enumerate(_get_stable_section_order(filtered_regions), start=1):
        labels.append(
            {
                "id": region["id"],
                "num": index,
                "cx": region["labelX"] if region.get("labelX") is not None else region["cx"],
                "cy": region["labelY"] if region.get("labelY") is not None else region["cy"],
                "canvasW": canvas_width,
                "canvasH": canvas_height,
                "left": region["left"],
                "top": region["top"],
                "right": region["right"],
                "bottom": region["bottom"],
                "w": region["w"],
                "h": region["h"],
                "fontPx": _get_fitted_section_label_font_px(index, region["w"], region["h"], region.get("clearancePx")),
            }
        )
    return _spread_section_label_positions(labels)


def _load_font(size):
    rounded_size = max(4, int(round(size)))
    for font_name in ("DejaVuSans.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(font_name, rounded_size)
        except OSError:
            continue
    return ImageFont.load_default()


def _fit_draw_font(draw, text, label):
    available_width = max(6.0, float(label.get("right", 0) or 0) - float(label.get("left", 0) or 0) - 4.0)
    available_height = max(6.0, float(label.get("bottom", 0) or 0) - float(label.get("top", 0) or 0) - 4.0)
    font_px = max(4.0, float(label.get("fontPx") or 8.0))

    while font_px >= 4.0:
        font = _load_font(font_px)
        stroke_width = max(1, int(round(font_px * 0.08)))
        bbox = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        if text_width <= available_width and text_height <= available_height:
            return font, stroke_width, bbox
        font_px -= 1.0

    font = _load_font(4)
    stroke_width = 1
    bbox = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
    return font, stroke_width, bbox


def render_numbered_pattern_raster(image_bytes):
    if not image_bytes:
        return None

    try:
        with Image.open(BytesIO(image_bytes)) as source_image:
            source = source_image.convert("RGBA")
    except Exception:
        return None

    canvas = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), BACKGROUND_RGB + (255,))
    scale = min(CANVAS_WIDTH / max(1, source.width), CANVAS_HEIGHT / max(1, source.height)) * 0.97
    draw_width = max(1, int(round(source.width * scale)))
    draw_height = max(1, int(round(source.height * scale)))
    offset_x = int(round((CANVAS_WIDTH - draw_width) / 2))
    offset_y = int(round((CANVAS_HEIGHT - draw_height) / 2))

    fitted = source.resize((draw_width, draw_height), Image.Resampling.LANCZOS)
    canvas.alpha_composite(fitted, (offset_x, offset_y))
    base = canvas.convert("RGB")
    base = _erase_existing_label_components(base)
    base = _render_clean_line_art(base)
    pixel_access = base.load()
    mask = _build_line_mask(pixel_access, CANVAS_WIDTH, CANVAS_HEIGHT)

    region_map, region_pixels = _build_region_map(mask, CANVAS_WIDTH, CANVAS_HEIGHT)
    labels = _collect_numbered_regions(region_map, region_pixels, CANVAS_WIDTH, CANVAS_HEIGHT)
    if not labels:
        return None

    draw = ImageDraw.Draw(base)
    for label in labels:
        text = str(label["num"])
        anchor_x = float(label.get("cx") or 0)
        anchor_y = float(label.get("cy") or 0)
        font, stroke_width, bbox = _fit_draw_font(draw, text, label)
        text_x = anchor_x - ((bbox[2] - bbox[0]) / 2.0)
        text_y = anchor_y - ((bbox[3] - bbox[1]) / 2.0)
        draw.text(
            (text_x, text_y),
            text,
            fill=(17, 17, 17),
            font=font,
            stroke_width=stroke_width,
            stroke_fill=(255, 255, 255),
        )

    buffer = BytesIO()
    base.save(buffer, format="PNG")
    return buffer.getvalue()