"""
WorkOrder and WorkOrderStatusHistory models for the work order workflow.
"""
from . import db


# Status values must match database ENUM
WORK_ORDER_STATUSES = (
    "Pending Review",
    "Under Review",
    "Revision Requested",
    "Revision Submitted",
    "Quote Sent",
    "Approved",
    "In Production",
    "Completed",
    "Cancelled",
)


class WorkOrder(db.Model):
    """
    Customer work order submission. work_order_number format: WO-YYYY-####.
    """

    __tablename__ = "work_orders"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    work_order_number = db.Column(db.String(20), unique=True, nullable=False, index=True)
    project_id = db.Column(
        db.Integer,
        db.ForeignKey("user_projects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    user_id = db.Column(db.Integer, nullable=False, index=True)
    status = db.Column(
        db.Enum(*WORK_ORDER_STATUSES, name="work_order_status"),
        default="Pending Review",
        nullable=False,
        index=True,
    )
    customer_notes = db.Column(db.Text, nullable=True)
    quote_amount = db.Column(db.Numeric(10, 2), nullable=True)
    admin_notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), onupdate=db.func.now())

    project = db.relationship("UserProject", backref=db.backref("work_orders", lazy="dynamic"))
    status_history = db.relationship(
        "WorkOrderStatusHistory",
        backref=db.backref("work_order", lazy="joined"),
        foreign_keys="WorkOrderStatusHistory.work_order_id",
        cascade="all, delete-orphan",
        order_by="WorkOrderStatusHistory.changed_at",
    )

    def __repr__(self):
        return f"<WorkOrder id={self.id} number={self.work_order_number!r} status={self.status!r}>"

    @staticmethod
    def validate_work_order_number(value: str) -> tuple[bool, str]:
        """
        Validate format WO-YYYY-#### (e.g. WO-2025-0001).
        Returns (ok: bool, error_message: str).
        """
        if not value or not isinstance(value, str):
            return False, "work_order_number is required"
        s = value.strip()
        if len(s) > 20:
            return False, "work_order_number must be at most 20 characters"
        import re
        if not re.match(r"^WO-\d{4}-\d{1,6}$", s):
            return False, "work_order_number must match WO-YYYY-#### (e.g. WO-2025-0001)"
        return True, ""

    def to_dict(self, include_history=False, include_admin_notes=False, include_project_data=False):
        out = {
            "id": self.id,
            "work_order_number": self.work_order_number,
            "project_id": self.project_id,
            "user_id": self.user_id,
            "status": self.status.value if hasattr(self.status, "value") else str(self.status),
            "customer_notes": self.customer_notes,
            "quote_amount": float(self.quote_amount) if self.quote_amount is not None else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_admin_notes:
            out["admin_notes"] = self.admin_notes
        if include_history and self.status_history:
            out["status_history"] = [h.to_dict() for h in self.status_history]
        # Include project design data for admin views
        if include_project_data and self.project:
            out["project"] = {
                "id": self.project.id,
                "name": self.project.name,
                "design_data": self.project.design_data if isinstance(self.project.design_data, dict) else {},
                "template_id": self.project.template_id,
            }
            # Include template info if available
            if self.project.template:
                template_svg = self.project.template.svg_content
                out["template"] = {
                    "id": self.project.template.id,
                    "name": self.project.template.name,
                    "thumbnail_url": self.project.template.thumbnail_url,
                    "svg_url": self.project.template.svg_url if hasattr(self.project.template, 'svg_url') else None,
                    "svg_content": template_svg if template_svg and str(template_svg).strip() else None,
                    "template_type": self.project.template.template_type,
                    "image_url": self.project.template.image_url,
                }
        # Include revision summary
        if hasattr(self, 'revisions'):
            rev_query = self.revisions
            rev_count = rev_query.count() if hasattr(rev_query, 'count') else 0
            out["revision_count"] = rev_count
            if rev_count > 0:
                latest = rev_query.order_by(None).order_by(
                    db.text("revision_number DESC")
                ).first()
                if latest:
                    out["latest_revision"] = latest.to_dict()
        return out


class WorkOrderStatusHistory(db.Model):
    """
    Audit log of work order status changes.
    """

    __tablename__ = "work_order_status_history"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    work_order_id = db.Column(
        db.Integer,
        db.ForeignKey("work_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_status = db.Column(db.String(50), nullable=True)
    to_status = db.Column(db.String(50), nullable=False)
    changed_at = db.Column(db.DateTime, server_default=db.func.now())
    changed_by = db.Column(db.String(255), nullable=True)

    def __repr__(self):
        return f"<WorkOrderStatusHistory id={self.id} work_order_id={self.work_order_id} {self.from_status!r}->{self.to_status!r}>"

    def to_dict(self):
        return {
            "id": self.id,
            "work_order_id": self.work_order_id,
            "from_status": self.from_status,
            "to_status": self.to_status,
            "changed_at": self.changed_at.isoformat() if self.changed_at else None,
            "changed_by": self.changed_by,
        }
