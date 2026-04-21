from io import BytesIO

from PIL import Image, ImageDraw

from backend.services.pattern_render_service import _build_line_mask, _get_fitted_section_label_font_px, render_numbered_pattern_raster


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


def test_build_line_mask_ignores_light_texture_noise():
    image = Image.new("RGB", (24, 24), (248, 244, 239))
    draw = ImageDraw.Draw(image)
    draw.rectangle((5, 5, 18, 18), outline=(12, 12, 12), width=2)

    for x in range(2, 10):
        image.putpixel((x, 20), (226, 218, 210))
    for point in ((20, 3), (21, 4), (20, 5), (3, 21), (4, 22), (5, 21)):
        image.putpixel(point, (70, 68, 66))

    mask = _build_line_mask(image.load(), image.width, image.height)

    assert mask[(20 * image.width) + 2] == 0
    assert mask[(20 * image.width) + 9] == 0
    assert mask[(3 * image.width) + 20] == 0
    assert mask[(5 * image.width) + 20] == 0
    assert mask[(5 * image.width) + 5] == 1
    assert mask[(5 * image.width) + 18] == 1


def test_render_numbered_pattern_raster_replaces_existing_labels_instead_of_doubling():
    first_render = render_numbered_pattern_raster(_two_box_pattern_bytes())
    second_render = render_numbered_pattern_raster(first_render)

    assert first_render is not None
    assert second_render is not None

    with Image.open(BytesIO(first_render)) as first_image, Image.open(BytesIO(second_render)) as second_image:
        first_rgb = first_image.convert("RGB")
        second_rgb = second_image.convert("RGB")

        def count_dark_pixels(image):
            total = 0
            for x in range(image.width):
                for y in range(image.height):
                    red, green, blue = image.getpixel((x, y))
                    if red < 90 and green < 90 and blue < 90:
                        total += 1
            return total

        first_dark = count_dark_pixels(first_rgb)
        second_dark = count_dark_pixels(second_rgb)

    assert second_dark <= int(first_dark * 1.12)