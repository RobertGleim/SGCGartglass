"""
SGCG Designer - API blueprints.
Legacy shop API and Designer template/admin template routes.
"""
from .shop import api
from .templates import templates_bp, admin_templates_bp
from .glass_types import glass_types_bp, admin_glass_types_bp

__all__ = [
    "api",
    "templates_bp",
    "admin_templates_bp",
    "glass_types_bp",
    "admin_glass_types_bp",
]
