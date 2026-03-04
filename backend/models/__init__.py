"""
SGCG Designer - SQLAlchemy models.
Import db first so model modules can use it; then import all models for Alembic/Flask shell.
"""
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# Import after db is created so models register with SQLAlchemy
from .template import Template, TemplateRegion
from .gallery_photo import GalleryPhoto
from .glass_type import GlassType
from .project import UserProject
from .work_order import WorkOrder, WorkOrderStatusHistory
from .revision import WorkOrderRevision

__all__ = [
    "db",
    "Template",
    "TemplateRegion",
    "GalleryPhoto",
    "GlassType",
    "UserProject",
    "WorkOrder",
    "WorkOrderStatusHistory",
    "WorkOrderRevision",
]
