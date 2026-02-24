from flask import Blueprint, request, jsonify, g
from sqlalchemy.exc import SQLAlchemyError
from backend.services.project_service import (
    save_project, get_user_projects, get_project_by_id, delete_project, calculate_completion_percentage
)
from backend.models import db
from datetime import datetime

projects_bp = Blueprint('projects', __name__)

# Placeholder for authentication decorator
def login_required(f):
    def wrapper(*args, **kwargs):
        # Assume g.user_id is set by real auth middleware
        if not hasattr(g, 'user_id') or not g.user_id:
            return jsonify({'error': 'Authentication required'}), 401
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
    return jsonify({'projects': [p.to_dict() for p in projects]}), 200

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
