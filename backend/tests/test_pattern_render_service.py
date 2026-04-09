from io import BytesIO

from PIL import Image, ImageDraw

from backend.services.pattern_render_service import render_numbered_pattern_raster


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