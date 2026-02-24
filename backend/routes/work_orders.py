from flask import Blueprint, request, jsonify, g
from backend.services.work_order_service import (
    submit_work_order, generate_work_order_number, send_work_order_emails, update_work_order_status, validate_design_completion
)
from backend.models import db, WorkOrder
from backend.models.project import UserProject
from backend.utils.email import send_email
from datetime import datetime

work_orders_bp = Blueprint('work_orders', __name__)
admin_work_orders_bp = Blueprint('admin_work_orders', __name__)

# Placeholder for authentication decorators
def login_required(f):
    def wrapper(*args, **kwargs):
        if not hasattr(g, 'user_id') or not g.user_id:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper

def admin_required(f):
    def wrapper(*args, **kwargs):
        if not hasattr(g, 'is_admin') or not g.is_admin:
            return jsonify({'error': 'Admin authentication required'}), 403
        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper

@work_orders_bp.route('/api/work-orders/submit', methods=['POST'])
@login_required
def submit_work_order_route():
    user_id = g.user_id
    data = request.get_json()
    project_id = data.get('project_id')
    project = UserProject.query.filter_by(id=project_id, user_id=user_id).first()
    if not project:
        return jsonify({'error': 'Project not found or not owned by user.'}), 404
    template = {}  # TODO: Load template by project.template_id
    work_order, err = submit_work_order(user_id, project_id, data, db.session, template)
    if err:
        return jsonify({'error': err}), 400
    # Send emails (replace with real emails)
    send_work_order_emails(work_order, 'customer@example.com', 'admin@example.com')
    return jsonify({'work_order': work_order.to_dict()}), 201

@work_orders_bp.route('/api/work-orders', methods=['GET'])
@login_required
def list_user_work_orders():
    user_id = g.user_id
    orders = WorkOrder.query.filter_by(user_id=user_id).order_by(WorkOrder.submitted_at.desc()).all()
    return jsonify({'work_orders': [o.to_dict() for o in orders]}), 200

@work_orders_bp.route('/api/work-orders/<int:order_id>', methods=['GET'])
@login_required
def get_work_order(order_id):
    user_id = g.user_id
    order = WorkOrder.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({'error': 'Work order not found or not owned by user.'}), 404
    return jsonify({'work_order': order.to_dict()}), 200

@admin_work_orders_bp.route('/api/admin/work-orders', methods=['GET'])
@admin_required
def admin_list_work_orders():
    orders = WorkOrder.query.order_by(WorkOrder.submitted_at.desc()).all()
    return jsonify({'work_orders': [o.to_dict() for o in orders]}), 200

@admin_work_orders_bp.route('/api/admin/work-orders/<int:order_id>/status', methods=['PUT'])
@admin_required
def admin_update_work_order_status(order_id):
    data = request.get_json()
    new_status = data.get('new_status')
    notes = data.get('notes')
    admin_id = g.user_id
    work_order, err = update_work_order_status(order_id, new_status, admin_id, notes, db.session)
    if err:
        return jsonify({'error': err}), 400
    return jsonify({'work_order': work_order.to_dict()}), 200
