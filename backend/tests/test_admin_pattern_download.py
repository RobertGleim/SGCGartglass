from io import BytesIO
from unittest.mock import patch

from PIL import Image, ImageDraw

from backend.app import create_app
from backend.auth import create_token


def _admin_headers():
    token = create_token("admin@example.com", role="admin")
    return {"Authorization": f"Bearer {token}"}


def _two_box_pattern_bytes():
    image = Image.new("RGB", (200, 120), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 80, 100), outline="black", width=3)
    draw.rectangle((120, 20, 180, 100), outline="black", width=3)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_admin_pattern_download_returns_attachment_for_digital_manual_product():
    app = create_app()
    app.config["TESTING"] = True

    with app.test_client() as client:
        with patch("backend.routes.shop.fetch_manual_product") as mock_fetch_manual_product, patch(
            "backend.routes.shop.get_manual_product_download_metadata"
        ) as mock_get_manual_product_download_metadata:
            mock_fetch_manual_product.return_value = {
                "id": 42,
                "name": "Sunflower Pattern",
                "description": "Digital pattern download",
                "is_digital_download": True,
                "images": [
                    {
                        "image_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF3cAAAAASUVORK5CYII=",
                    }
                ],
            }
            mock_get_manual_product_download_metadata.return_value = {
                "pattern_name": "Sunflower Pattern",
                "image_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF3cAAAAASUVORK5CYII=",
            }

            response = client.get("/api/admin/manual-products/42/pattern-download", headers=_admin_headers())

    assert response.status_code == 200
    assert response.headers.get("Content-Disposition", "").startswith("attachment;")
    assert "Sunflower_Pattern" in response.headers.get("Content-Disposition", "")


def test_admin_pattern_download_prefers_linked_template_asset():
    app = create_app()
    app.config["TESTING"] = True

    with app.test_client() as client:
        with patch("backend.routes.shop.fetch_manual_product") as mock_fetch_manual_product, patch(
            "backend.routes.shop.get_manual_product_download_metadata"
        ) as mock_get_manual_product_download_metadata:
            mock_fetch_manual_product.return_value = {
                "id": 42,
                "name": "Rainbow Maker Pattern",
                "description": "Digital pattern download",
                "is_digital_download": True,
                "images": [
                    {
                        "image_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF3cAAAAASUVORK5CYII=",
                    }
                ],
            }
            mock_get_manual_product_download_metadata.return_value = {
                "pattern_name": "Rainbow Maker Pattern",
                "svg_content": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><text x=\"1\" y=\"5\">1</text></svg>",
                "image_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF3cAAAAASUVORK5CYII=",
            }

            response = client.get("/api/admin/manual-products/42/pattern-download", headers=_admin_headers())

    assert response.status_code == 200
    assert response.mimetype == "image/svg+xml"
    assert b"<text" in response.data


def test_admin_pattern_download_generates_numbered_png_for_image_templates():
    app = create_app()
    app.config["TESTING"] = True

    with app.test_client() as client:
        with patch("backend.routes.shop.fetch_manual_product") as mock_fetch_manual_product, patch(
            "backend.routes.shop.get_manual_product_download_metadata"
        ) as mock_get_manual_product_download_metadata:
            mock_fetch_manual_product.return_value = {
                "id": 44,
                "name": "Rainbow Maker Pattern",
                "description": "Digital pattern download",
                "is_digital_download": True,
                "images": [],
            }
            mock_get_manual_product_download_metadata.return_value = {
                "pattern_name": "Rainbow Maker Pattern",
                "template_type": "image",
                "image_data": _two_box_pattern_bytes(),
                "image_mime": "image/png",
            }

            response = client.get("/api/admin/manual-products/44/pattern-download", headers=_admin_headers())

    assert response.status_code == 200
    assert response.mimetype == "image/png"

    with Image.open(BytesIO(response.data)) as generated:
        rgb = generated.convert("RGB")
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


def test_admin_pattern_download_rejects_non_digital_manual_product():
    app = create_app()
    app.config["TESTING"] = True

    with app.test_client() as client:
        with patch("backend.routes.shop.fetch_manual_product") as mock_fetch_manual_product:
            mock_fetch_manual_product.return_value = {
                "id": 43,
                "name": "Physical Panel",
                "is_digital_download": False,
                "images": [],
            }

            response = client.get("/api/admin/manual-products/43/pattern-download", headers=_admin_headers())

    assert response.status_code == 400
    assert response.get_json()["error"] == "not_digital_download"