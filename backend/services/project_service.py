from datetime import datetime
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from backend.models.project import UserProject


def save_project(user_id, data, db: Session):
    project_id = data.get('project_id')
    now = datetime.utcnow()
    if not data.get('design_data'):
        return None, 'Missing design_data.'
    if not data.get('template_id'):
        return None, 'Missing template_id.'
    project_name = data.get('project_name') or f"Untitled Design - {now.strftime('%Y-%m-%d')}"
    is_submitted = bool(data.get('is_submitted', False))
    try:
        if project_id:
            project = db.query(UserProject).filter_by(id=project_id, user_id=user_id).first()
            if not project:
                return None, 'Project not found or not owned by user.'
            project.template_id = data['template_id']
            project.project_name = project_name
            project.design_data = data['design_data']
            project.is_submitted = is_submitted
            project.updated_at = now
        else:
            project = UserProject(
                user_id=user_id,
                template_id=data['template_id'],
                project_name=project_name,
                design_data=data['design_data'],
                is_submitted=is_submitted,
                created_at=now,
                updated_at=now
            )
            db.add(project)
        db.commit()
        db.refresh(project)
        return project, None
    except SQLAlchemyError as e:
        db.rollback()
        return None, str(e)

def get_user_projects(user_id, filters, db: Session):
    try:
        q = db.query(UserProject).filter_by(user_id=user_id)
        # Add filter logic here if needed
        projects = q.order_by(UserProject.updated_at.desc()).all()
        return projects, None
    except SQLAlchemyError as e:
        return None, str(e)

def get_project_by_id(project_id, user_id, db: Session):
    try:
        project = db.query(UserProject).filter_by(id=project_id, user_id=user_id).first()
        if not project:
            return None, 'Project not found or not owned by user.'
        return project, None
    except SQLAlchemyError as e:
        return None, str(e)

def delete_project(project_id, user_id, db: Session):
    try:
        project = db.query(UserProject).filter_by(id=project_id, user_id=user_id).first()
        if not project:
            return False, 'Project not found or not owned by user.'
        project.is_submitted = False  # Soft delete: mark as not submitted
        db.commit()
        return True, None
    except SQLAlchemyError as e:
        db.rollback()
        return False, str(e)

def calculate_completion_percentage(design_data, template):
    try:
        regions = design_data.get('regions', [])
        total = len(template.get('regions', []))
        filled = sum(1 for r in regions if r.get('color'))
        percent = int((filled / total) * 100) if total > 0 else 0
        return percent
    except Exception:
        return 0
