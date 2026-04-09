import pytest

from backend.routes.shop import (
    _normalize_manual_product_dimensions,
    _parse_manual_dimension_value,
)


@pytest.mark.parametrize(
    ("raw_value", "expected"),
    [
        ("25.25", 25.25),
        ("48 3/8", 48.375),
        ("48 3/8 inch", 48.375),
        ("48-3/8", 48.375),
        ("3/8", 0.375),
        (12, 12.0),
        (None, None),
        ("", None),
    ],
)
def test_parse_manual_dimension_value_accepts_decimal_and_fraction_formats(raw_value, expected):
    assert _parse_manual_dimension_value("width", raw_value) == pytest.approx(expected) if expected is not None else _parse_manual_dimension_value("width", raw_value) is None


@pytest.mark.parametrize(
    "raw_value",
    [
        True,
        "abc",
        "48 3/0",
        "inch",
        "1 /",
        -1,
        "-4.5",
    ],
)
def test_parse_manual_dimension_value_rejects_invalid_formats(raw_value):
    with pytest.raises(ValueError):
        _parse_manual_dimension_value("height", raw_value)


def test_normalize_manual_product_dimensions_converts_each_dimension_field():
    normalized = _normalize_manual_product_dimensions(
        {
            "width": "48 3/8 inch",
            "height": "25.25",
            "depth": "3/8",
        }
    )

    assert normalized["width"] == pytest.approx(48.375)
    assert normalized["height"] == pytest.approx(25.25)
    assert normalized["depth"] == pytest.approx(0.375)