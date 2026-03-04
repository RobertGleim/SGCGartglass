"""
Template and TemplateRegion models for SVG templates and their glass regions (paths).
"""
import re
from . import db


class Template(db.Model):
    """
    SVG template: one design (e.g. Sunflower, Geometric Panel).
    svg_content holds the full SVG; each region is a <path> with unique id.
    """

    __tablename__ = "templates"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(100), nullable=True, index=True)
    difficulty = db.Column(db.String(50), nullable=True)   # Beginner / Intermediate / Advanced
    dimensions = db.Column(db.String(100), nullable=True)  # e.g. "12x16 inches"
    piece_count = db.Column(db.Integer, nullable=True)
    svg_content = db.Column(db.Text, nullable=True)          # None for image-based templates
    image_url = db.Column(db.String(500), nullable=True)     # URL for JPEG/PDF-converted images
    image_data = db.Column(db.LargeBinary, nullable=True)     # Raw image bytes (persists across deploys)
    image_mime = db.Column(db.String(50), nullable=True)      # e.g. 'image/png'
    template_type = db.Column(db.String(20), nullable=False, default='svg')  # 'svg' or 'image'
    default_design_data = db.Column(db.JSON, nullable=True)
    is_private = db.Column(db.Boolean, default=False, nullable=False, index=True)
    assigned_customer_id = db.Column(db.Integer, nullable=True, index=True)
    thumbnail_url = db.Column(db.String(500), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), onupdate=db.func.now())

    regions = db.relationship(
        "TemplateRegion",
        backref=db.backref("template", lazy="joined"),
        foreign_keys="TemplateRegion.template_id",
        cascade="all, delete-orphan",
        order_by="TemplateRegion.display_order",
    )

    def __repr__(self):
        return f"<Template id={self.id} name={self.name!r} category={self.category!r}>"

    def validate_svg_path(self, path_id: str) -> bool:
        """
        Check that path_id exists as a region for this template.
        Optionally checks that the id appears in svg_content.
        """
        if not path_id or not path_id.strip():
            return False
        for region in self.regions:
            if region.region_id == path_id.strip():
                return True
        return False

    def to_dict(self, include_regions=True, include_svg=True):
        """Serialize to JSON-friendly dict."""
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "difficulty": self.difficulty,
            "dimensions": self.dimensions,
            "piece_count": self.piece_count,
            "template_type": self.template_type or 'svg',
            "image_url": self.image_url,
            "default_design_data": self.default_design_data if isinstance(self.default_design_data, dict) else None,
            "is_private": bool(self.is_private),
            "assigned_customer_id": self.assigned_customer_id,
            "thumbnail_url": self.thumbnail_url,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_svg:
            data["svg_content"] = self.svg_content
        if include_regions and self.regions:
            data["regions"] = [r.to_dict() for r in self.regions]
        return data


class TemplateRegion(db.Model):
    """
    One glass piece (path) in a template. region_id must match <path id="..."> in the template SVG.
    """

    __tablename__ = "template_regions"
    __table_args__ = (
        db.UniqueConstraint("template_id", "region_id", name="uq_template_region"),
        {"mysql_charset": "utf8mb4"},
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    template_id = db.Column(db.Integer, db.ForeignKey("templates.id", ondelete="CASCADE"), nullable=False, index=True)
    region_id = db.Column(db.String(100), nullable=False)
    display_order = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    def __repr__(self):
        return f"<TemplateRegion id={self.id} template_id={self.template_id} region_id={self.region_id!r}>"

    @staticmethod
    def validate_region_id(region_id: str) -> bool:
        """
        Basic validation: non-empty, safe for SVG id (alphanumeric, hyphen, underscore).
        """
        if not region_id or not isinstance(region_id, str):
            return False
        s = region_id.strip()
        if not s:
            return False
        return bool(re.match(r"^[a-zA-Z0-9_\-]+$", s))

    def to_dict(self):
        return {
            "id": self.id,
            "template_id": self.template_id,
            "region_id": self.region_id,
            "display_order": self.display_order,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
