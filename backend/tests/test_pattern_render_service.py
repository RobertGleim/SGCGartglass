from io import BytesIO

from PIL import Image, ImageDraw

from backend.services.pattern_render_service import _get_fitted_section_label_font_px, render_numbered_pattern_raster


def _two_box_pattern_bytes():
    image = Image.new("RGB", (200, 120), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 80, 100), outline="black", width=3)
    draw.rectangle((120, 20, 180, 100), outline="black", width=3)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_render_numbered_pattern_raster_draws_labels_inside_regions():
    rendered = render_numbered_pattern_raster(_two_box_pattern_bytes())

    assert rendered is not None

    with Image.open(BytesIO(rendered)) as output:
        rgb = output.convert("RGB")
        assert rgb.size == (840, 600)

        left_dark_pixels = 0
        for x in range(180, 255):
            for y in range(265, 335):
                red, green, blue = rgb.getpixel((x, y))
                if red < 90 and green < 90 and blue < 90:
                    left_dark_pixels += 1

        right_dark_pixels = 0
        for x in range(590, 665):
            for y in range(265, 335):
                red, green, blue = rgb.getpixel((x, y))
                if red < 90 and green < 90 and blue < 90:
                    right_dark_pixels += 1

    assert left_dark_pixels > 20
    assert right_dark_pixels > 20


def test_render_numbered_pattern_raster_returns_none_for_invalid_input():
    assert render_numbered_pattern_raster(b"not-an-image") is None


def test_fitted_section_label_font_px_shrinks_for_small_crowded_regions():
    large_single_digit = _get_fitted_section_label_font_px(8, width=80, height=80, clearance_px=20)
    small_three_digit = _get_fitted_section_label_font_px(123, width=22, height=14, clearance_px=4)

    assert large_single_digit > small_three_digit
    assert small_three_digit <= 6