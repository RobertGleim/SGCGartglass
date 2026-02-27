"""
WorkOrderRevision model — tracks each design edit by customer or admin.

Every time either party edits the work order design and submits,
a new revision is created preserving the full design_data snapshot.
This enables back-and-forth collaboration without losing history.
"""
from . import db


class WorkOrderRevision(db.Model):
    """
    Immutable snapshot of a work order's design at a point in time.
    """

    __tablename__ = "work_order_revisions"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    work_order_id = db.Column(
        db.Integer,
        db.ForeignKey("work_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    revision_number = db.Column(db.Integer, nullable=False, default=1)
    author_type = db.Column(
        db.String(20), nullable=False, default="customer"
    )  # 'customer' | 'admin'
    author_id = db.Column(db.String(255), nullable=True)
    design_data = db.Column(db.JSON, nullable=False)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    work_order = db.relationship(
        "WorkOrder",
        backref=db.backref(
            "revisions",
            lazy="dynamic",
            cascade="all, delete-orphan",
            order_by="WorkOrderRevision.revision_number",
        ),
    )

    def __repr__(self):
        return (
            f"<WorkOrderRevision id={self.id} wo={self.work_order_id} "
            f"rev={self.revision_number} by={self.author_type}>"
        )

    def to_dict(self):
        return {
            "id": self.id,
            "work_order_id": self.work_order_id,
            "revision_number": self.revision_number,
            "author_type": self.author_type,
            "author_id": self.author_id,
            "design_data": self.design_data if isinstance(self.design_data, dict) else {},
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
