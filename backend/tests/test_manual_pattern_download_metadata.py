from unittest.mock import patch

from backend.db import _fetch_manual_product_download_metadata


class _CursorStub:
    def __init__(self, row):
        self._row = row

    def execute(self, query, params):
        self.query = query
        self.params = params

    def fetchone(self):
        return self._row


def test_manual_product_download_metadata_prefers_linked_template_assets():
    cursor = _CursorStub(
        {
            "id": 42,
            "name": "Rainbow Maker Pattern",
            "description": "Manual listing description",
            "price": 19.5,
            "is_digital_download": True,
            "related_links": '{"template_id": 36, "template_name": "Rainbow maker"}',
            "image_url": "/uploads/products/manual-preview.jpg",
        }
    )

    with patch("backend.db._fetch_template_download_metadata") as mock_fetch_template_download_metadata:
        mock_fetch_template_download_metadata.return_value = {
            "template_id": 36,
            "template_name": "Rainbow maker",
            "template_description": "Template description",
            "template_type": "svg",
            "svg_content": "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
            "image_url": "/uploads/templates/rainbow-numbered.svg",
            "image_data": None,
            "image_mime": None,
            "thumbnail_url": "/uploads/templates/rainbow-thumb.jpg",
        }

        metadata = _fetch_manual_product_download_metadata(cursor, 42)

    assert metadata["pattern_name"] == "Rainbow Maker Pattern"
    assert metadata["template_id"] == 36
    assert metadata["svg_content"] == "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"
    assert metadata["image_url"] == "/uploads/templates/rainbow-numbered.svg"
    assert metadata["thumbnail_url"] == "/uploads/templates/rainbow-thumb.jpg"


def test_manual_product_download_metadata_falls_back_to_manual_image_without_template_asset():
    cursor = _CursorStub(
        {
            "id": 43,
            "name": "Plain Pattern",
            "description": "Manual listing description",
            "price": 12,
            "is_digital_download": True,
            "related_links": None,
            "image_url": "/uploads/products/plain-preview.jpg",
        }
    )

    metadata = _fetch_manual_product_download_metadata(cursor, 43)

    assert metadata["pattern_name"] == "Plain Pattern"
    assert metadata["svg_content"] is None
    assert metadata["image_url"] == "/uploads/products/plain-preview.jpg"