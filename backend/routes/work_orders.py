from flask import Blueprint, request, jsonify, g
from backend.services.work_order_service import (
    submit_work_order, generate_work_order_number, send_work_order_emails, update_work_order_status, validate_design_completion
)
from backend.models import db, WorkOrder, Template
from backend.models.project import UserProject
from backend.utils.email import send_email
from backend.auth import decode_token
from datetime import datetime
import jwt

work_orders_bp = Blueprint('work_orders', __name__)
admin_work_orders_bp = Blueprint('admin_work_orders', __name__)

# Authentication decorator that parses JWT and sets g.user_id
def login_required(f):
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({'error': 'Authentication required'}), 401
        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = decode_token(token)
            # Set user_id from customer_id or sub (email for admin)
            g.user_id = payload.get("customer_id") or payload.get("sub")
            g.is_admin = payload.get("role") != "customer"
            g.auth_payload = payload
        except jwt.PyJWTError:
            return jsonify({'error': 'Invalid or expired token'}), 401
        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper

def admin_required(f):
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({'error': 'Authentication required'}), 401
        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = decode_token(token)
            # Admin tokens don't have role=customer
            if payload.get("role") == "customer":
                return jsonify({'error': 'Admin authentication required'}), 403
            g.user_id = payload.get("sub")
            g.is_admin = True
            g.auth_payload = payload
        except jwt.PyJWTError:
            return jsonify({'error': 'Invalid or expired token'}), 401
        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper

@work_orders_bp.route('/api/work-orders/submit', methods=['POST'])
@login_required
def submit_work_order_route():
    user_id = g.user_id
    data = request.get_json() or {}
    project_id = data.get('project_id')
    incoming_design = data.get('canvas_data') or data.get('design_data') or {}

    # Auto-save project when none exists yet
    if not project_id:
        design_data = incoming_design if isinstance(incoming_design, dict) else {}
        template_id = data.get('template_id')
        if not template_id:
            return jsonify({'error': 'template_id is required for work order submission.'}), 400
        template = Template.query.filter_by(id=template_id, is_active=True).first()
        if not template:
            return jsonify({'error': 'Template not found.'}), 404
        if (template.template_type or '').lower() != 'svg' or not template.svg_content:
            return jsonify({'error': 'Work orders must use an SVG template.'}), 400
        auto_project = UserProject(
            user_id=user_id,
            template_id=template_id,
            name=data.get('project_name') or data.get('name') or 'My Design',
            design_data=design_data,
        )
        db.session.add(auto_project)
        db.session.commit()
        project_id = auto_project.id
        data['design_data'] = design_data

    # Verify ownership for existing/newly-created project
    project = None
    if project_id:
        project = UserProject.query.filter_by(id=project_id, user_id=user_id).first()
        if not project:
            return jsonify({'error': 'Project not found or not owned by user.'}), 404
        if not project.template:
            return jsonify({'error': 'Project template is missing.'}), 400
        if (project.template.template_type or '').lower() != 'svg' or not project.template.svg_content:
            return jsonify({'error': 'Work orders must use an SVG template.'}), 400
        # Persist latest design data on submission so admin sees correct sections
        if isinstance(incoming_design, dict) and incoming_design:
            project.design_data = incoming_design
            db.session.commit()
            data['design_data'] = incoming_design
        elif project.design_data and isinstance(project.design_data, dict):
            # Ensure downstream validation gets design_data even if payload omitted it
            data['design_data'] = project.design_data
    
    template = {}  # Empty template to skip validation if no project
    work_order, err = submit_work_order(user_id, project_id, data, db.session, template)
    if err:
        return jsonify({'error': err}), 400
    # Send emails (replace with real emails)
    send_work_order_emails(work_order, 'customer@example.com', 'admin@example.com')
    return jsonify({'work_order': work_order.to_dict(), 'project_id': project_id}), 201

@work_orders_bp.route('/api/work-orders', methods=['GET'])
@login_required
def list_user_work_orders():
    user_id = g.user_id
    orders = WorkOrder.query.filter_by(user_id=user_id).order_by(WorkOrder.created_at.desc()).all()
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
    orders = WorkOrder.query.order_by(WorkOrder.created_at.desc()).all()
    return jsonify({'work_orders': [o.to_dict(include_admin_notes=True, include_project_data=True) for o in orders]}), 200

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

@admin_work_orders_bp.route('/api/admin/work-orders/<int:order_id>/design-data', methods=['PUT'])
@admin_required
def admin_update_work_order_design_data(order_id):
    order = WorkOrder.query.get(order_id)
    if not order:
        return jsonify({'error': 'Work order not found.'}), 404
    if not order.project:
        return jsonify({'error': 'No project associated with this work order.'}), 400

    data = request.get_json() or {}
    design_data = data.get('design_data')
    if not isinstance(design_data, dict):
        return jsonify({'error': 'design_data must be a JSON object'}), 400

    order.project.design_data = design_data
    db.session.commit()

    return jsonify({
        'message': 'Design data updated.',
        'work_order': order.to_dict(include_admin_notes=True, include_project_data=True),
    }), 200

@admin_work_orders_bp.route('/api/admin/work-orders/<int:order_id>', methods=['DELETE'])
@admin_required
def admin_delete_work_order(order_id):
    order = WorkOrder.query.get(order_id)
    if not order:
        return jsonify({'error': 'Work order not found.'}), 404
    db.session.delete(order)
    db.session.commit()
    return jsonify({'message': 'Work order deleted.'}), 200
