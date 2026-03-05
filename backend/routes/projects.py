from flask import Blueprint, request, jsonify, g
from sqlalchemy.exc import SQLAlchemyError
from backend.services.project_service import (
    save_project, get_user_projects, get_project_by_id, delete_project, calculate_completion_percentage
)
from backend.models import db
from backend.models.work_order import WorkOrder
from backend.auth import decode_token
from datetime import datetime
import jwt

projects_bp = Blueprint('projects', __name__)

# Authentication decorator that parses JWT and sets g.user_id
def login_required(f):
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({'error': 'Authentication required'}), 401
        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = decode_token(token)
            # Set user_id from customer_id (for customers) or sub (for admin)
            g.user_id = payload.get("customer_id") or payload.get("sub")
            g.is_admin = payload.get("role") != "customer"
            g.auth_payload = payload
        except jwt.PyJWTError:
            return jsonify({'error': 'Invalid or expired token'}), 401
        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper

@projects_bp.route('/api/projects/save', methods=['POST'])
@login_required
def save_project_route():
    user_id = g.user_id
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Missing JSON body'}), 400
    project, err = save_project(user_id, data, db.session)
    if err:
        if 'not owned' in err:
            return jsonify({'error': err}), 403
        return jsonify({'error': err}), 400
    return jsonify({'project': project.to_dict()}), 200

@projects_bp.route('/api/projects', methods=['GET'])
@login_required
def list_projects_route():
    user_id = g.user_id
    filters = request.args.to_dict()
    projects, err = get_user_projects(user_id, filters, db.session)
    if err:
        return jsonify({'error': err}), 500

    project_ids = [p.id for p in projects if p and p.id is not None]
    latest_order_by_project = {}
    if project_ids:
        rows = (
            db.session.query(WorkOrder.project_id, WorkOrder.id, WorkOrder.status)
            .filter(WorkOrder.project_id.in_(project_ids))
            .order_by(WorkOrder.project_id.asc(), WorkOrder.created_at.desc())
            .all()
        )
        for project_id, work_order_id, work_order_status in rows:
            if project_id not in latest_order_by_project:
                latest_order_by_project[project_id] = {
                    'work_order_id': work_order_id,
                    'work_order_status': work_order_status.value if hasattr(work_order_status, 'value') else str(work_order_status),
                }

    response_projects = []
    for project in projects:
        design_data = project.design_data if isinstance(project.design_data, dict) else {}
        payload = {
            'id': project.id,
            'user_id': project.user_id,
            'template_id': project.template_id,
            'name': project.name,
            'preview_url': design_data.get('preview_url') or design_data.get('dataUrl'),
            'created_at': project.created_at.isoformat() if project.created_at else None,
            'updated_at': project.updated_at.isoformat() if project.updated_at else None,
        }
        payload.update(latest_order_by_project.get(project.id, {}))
        response_projects.append(payload)

    return jsonify({'projects': response_projects}), 200

@projects_bp.route('/api/projects/<int:project_id>', methods=['GET'])
@login_required
def get_project_route(project_id):
    user_id = g.user_id
    project, err = get_project_by_id(project_id, user_id, db.session)
    if err:
        if 'not owned' in err:
            return jsonify({'error': err}), 403
        return jsonify({'error': err}), 404
    return jsonify({'project': project.to_dict()}), 200

@projects_bp.route('/api/projects/<int:project_id>', methods=['DELETE'])
@login_required
def delete_project_route(project_id):
    user_id = g.user_id
    ok, err = delete_project(project_id, user_id, db.session)
    if err:
        if 'not owned' in err:
            return jsonify({'error': err}), 403
        return jsonify({'error': err}), 404
    return jsonify({'success': True}), 200
