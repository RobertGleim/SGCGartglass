"""
UserProject model: saved designer projects with JSON design_data.
"""
import json
from . import db


class UserProject(db.Model):
    """
    Saved design. design_data is JSON: { "regionId": { "color": "#hex", "glassTypeId": n }, ... }.
    """

    __tablename__ = "user_projects"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, nullable=False, index=True)
    template_id = db.Column(
        db.Integer,
        db.ForeignKey("templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name = db.Column(db.String(255), nullable=True)
    design_data = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), onupdate=db.func.now())

    template = db.relationship("Template", backref=db.backref("user_projects", lazy="dynamic"))
    # work_orders: see WorkOrder.project backref

    def __repr__(self):
        return f"<UserProject id={self.id} user_id={self.user_id} name={self.name!r}>"

    @staticmethod
    def validate_design_data(data) -> tuple[bool, str]:
        """
        Validate design_data structure: dict of region_id -> { color?, glassTypeId? }.
        Returns (ok: bool, error_message: str).
        """
        if data is None:
            return False, "design_data is required"
        if not isinstance(data, dict):
            return False, "design_data must be a JSON object"
        for region_id, value in data.items():
            if not isinstance(region_id, str) or not region_id.strip():
                return False, f"Invalid region_id: {region_id!r}"
            if not isinstance(value, dict):
                return False, f"design_data[{region_id!r}] must be an object"
            if "color" in value and not isinstance(value["color"], str):
                return False, f"design_data[{region_id!r}].color must be a string"
            if "glassTypeId" in value:
                try:
                    gid = value["glassTypeId"]
                    if gid is not None and not isinstance(gid, int):
                        if isinstance(gid, str) and gid.isdigit():
                            value["glassTypeId"] = int(gid)
                        else:
                            return False, f"design_data[{region_id!r}].glassTypeId must be an integer"
                except (TypeError, ValueError):
                    return False, f"design_data[{region_id!r}].glassTypeId must be an integer"
        return True, ""

    def to_dict(self, include_design_data=True):
        out = {
            "id": self.id,
            "user_id": self.user_id,
            "template_id": self.template_id,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_design_data:
            out["design_data"] = self.design_data if isinstance(self.design_data, dict) else {}
        return out


# Avoid circular import: WorkOrder is referenced in relationship above.
# Define relationship using string "WorkOrder"; SQLAlchemy resolves it.
# Already using "WorkOrder" in foreign_keys and backref, so we need to fix:
# In project.py we reference WorkOrder in the relationship. So we need to import WorkOrder
# at the end of the file or use the string name. In SQLAlchemy, using the string "WorkOrder"
# is enough for the relationship. So we don't need to import WorkOrder in project.py.
# But we have backref to "project" on WorkOrder - so WorkOrder will have project_id and
# project. So we're good. Let me double-check: UserProject.work_orders -> WorkOrder.
# WorkOrder has project_id and we want cascade delete - actually in the schema we had
# work_orders.project_id ON DELETE CASCADE to user_projects. So when user_project is
# deleted, work_orders are deleted. So in SQLAlchemy we don't need to cascade from
# UserProject to WorkOrder for delete (DB does it), but we can use passive_deletes
# or just list the relationship. I used cascade="all, delete-orphan" - delete-orphan
# is for when the child is removed from the collection; for actual DB CASCADE we
# rely on the database. So it's fine. Let me remove the duplicate - we have
# foreign_keys="WorkOrder.project_id" so SQLAlchemy knows. Good.