"""
Photo gallery model for user/admin submitted project photos.
"""
from . import db


class GalleryPhoto(db.Model):
    __tablename__ = "gallery_photos"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    panel_name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.String(200), nullable=True)
    category = db.Column(db.String(100), nullable=True, index=True)
    submission_group_id = db.Column(db.String(64), nullable=True, index=True)
    image_url = db.Column(db.String(500), nullable=False)
    image_data = db.Column(db.LargeBinary, nullable=True)
    image_mime = db.Column(db.String(80), nullable=True)
    template_id = db.Column(db.Integer, db.ForeignKey("templates.id", ondelete="SET NULL"), nullable=True, index=True)
    show_description = db.Column(db.Boolean, nullable=False, default=True)
    is_hidden = db.Column(db.Boolean, nullable=False, default=False, index=True)
    approval_status = db.Column(db.String(20), nullable=False, default="pending", index=True)
    created_by_role = db.Column(db.String(20), nullable=True)
    created_by_id = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), onupdate=db.func.now())

    template = db.relationship("Template", backref=db.backref("gallery_photos", lazy="dynamic"))

    def to_dict(self, include_admin_fields=False):
        template_name = self.template.name if self.template else None
        data = {
            "id": self.id,
            "panel_name": self.panel_name,
            "description": self.description if self.show_description else None,
            "category": self.category,
            "submission_group_id": self.submission_group_id,
            "image_url": self.image_url,
            "template_id": self.template_id,
            "template_name": template_name,
            "show_description": self.show_description,
            "is_hidden": self.is_hidden,
            "approval_status": self.approval_status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_admin_fields:
            data["raw_description"] = self.description
            data["created_by_role"] = self.created_by_role
            data["created_by_id"] = self.created_by_id
        return data
