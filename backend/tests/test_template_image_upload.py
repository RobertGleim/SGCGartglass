from io import BytesIO

from PIL import Image, ImageDraw

from backend.app import create_app
from backend.auth import create_token


def _admin_headers():
    token = create_token("admin@example.com", role="admin")
    return {"Authorization": f"Bearer {token}"}


def _template_image_bytes():
    image = Image.new("RGB", (200, 120), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 80, 100), outline="black", width=3)
    draw.rectangle((120, 20, 180, 100), outline="black", width=3)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_upload_template_image_normalizes_raster_template_to_png():
    app = create_app()
    app.config["TESTING"] = True

    with app.test_client() as client:
        response = client.post(
            "/api/admin/templates/upload-image",
            headers=_admin_headers(),
            data={"file": (BytesIO(_template_image_bytes()), "dolphin-template.jpg")},
            content_type="multipart/form-data",
        )

    assert response.status_code == 201
    payload = response.get_json()
    assert str(payload.get("image_url") or "").endswith(".png")

    with app.app_context():
        relative_path = str(payload["image_url"]).lstrip("/")
        absolute_path = app.root_path + "/" + relative_path.replace("/", "/")
        with Image.open(absolute_path) as uploaded:
            assert uploaded.size == (840, 600)
            assert uploaded.format == "PNG"
