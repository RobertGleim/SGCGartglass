from flask import Blueprint, request, jsonify, g
from backend.services.work_order_service import (
    submit_work_order, generate_work_order_number, send_work_order_emails, update_work_order_status, validate_design_completion
)
from backend.models import db, WorkOrder, WorkOrderStatusHistory
from backend.models.revision import WorkOrderRevision
from backend.models.project import UserProject
from backend.models.template import Template
from backend.utils.email import send_email
from backend.auth import decode_token
from datetime import datetime
import jwt
from backend.db import fetch_customer_by_id

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
        # Persist latest design data on submission so admin sees correct sections
        if isinstance(incoming_design, dict) and incoming_design:
            project.design_data = incoming_design
            db.session.commit()
            data['design_data'] = incoming_design
        elif project.design_data and isinstance(project.design_data, dict):
            # Ensure downstream validation gets design_data even if payload omitted it
            data['design_data'] = project.design_data
    
    template = {}  # Empty template to skip validation if no project

    # Prevent duplicate work orders for the same project
    if project_id:
        existing_wo = WorkOrder.query.filter_by(project_id=project_id).first()
        if existing_wo:
            return jsonify({
                'error': 'A work order already exists for this project.',
                'work_order': existing_wo.to_dict(),
                'project_id': project_id,
            }), 409

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
    return jsonify({'work_orders': [o.to_dict(include_project_data=True) for o in orders]}), 200

@work_orders_bp.route('/api/work-orders/<int:order_id>', methods=['GET'])
@login_required
def get_work_order(order_id):
    user_id = g.user_id
    order = WorkOrder.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({'error': 'Work order not found or not owned by user.'}), 404
    # Include project data & template so customer can open design in editor
    return jsonify({'work_order': order.to_dict(include_project_data=True)}), 200


@work_orders_bp.route('/api/work-orders/<int:order_id>', methods=['DELETE'])
@login_required
def delete_work_order(order_id):
    """Customer deletes their own work order."""
    user_id = g.user_id
    order = WorkOrder.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({'error': 'Work order not found or not owned by user.'}), 404

    db.session.delete(order)
    db.session.commit()
    return jsonify({'message': 'Work order deleted.'}), 200


# ── Customer revision endpoints ──────────────────────────────────────

@work_orders_bp.route('/api/work-orders/<int:order_id>/revisions', methods=['GET'])
@login_required
def list_revisions(order_id):
    """List all revisions for a work order (customer owns it)."""
    user_id = g.user_id
    order = WorkOrder.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({'error': 'Work order not found.'}), 404
    revisions = (
        WorkOrderRevision.query
        .filter_by(work_order_id=order_id)
        .order_by(WorkOrderRevision.revision_number.asc())
        .all()
    )
    return jsonify({'revisions': [r.to_dict() for r in revisions]}), 200


@work_orders_bp.route('/api/work-orders/<int:order_id>/revisions', methods=['POST'])
@login_required
def create_customer_revision(order_id):
    """Customer submits a new design revision."""
    user_id = g.user_id
    order = WorkOrder.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({'error': 'Work order not found.'}), 404

    data = request.get_json() or {}
    design_data = data.get('design_data')
    if not isinstance(design_data, dict):
        return jsonify({'error': 'design_data must be a JSON object'}), 400

    # Determine next revision number
    max_rev = (
        db.session.query(db.func.max(WorkOrderRevision.revision_number))
        .filter_by(work_order_id=order_id)
        .scalar()
    ) or 0

    revision = WorkOrderRevision(
        work_order_id=order_id,
        revision_number=max_rev + 1,
        author_type='customer',
        author_id=user_id,
        design_data=design_data,
        notes=data.get('notes'),
    )
    db.session.add(revision)

    # Update the project's design_data to match latest revision
    if order.project:
        order.project.design_data = design_data
    
    # Update work order status
    old_status = order.status
    order.status = 'Revision Submitted'
    
    history = WorkOrderStatusHistory(
        work_order_id=order_id,
        from_status=old_status if isinstance(old_status, str) else str(old_status),
        to_status='Revision Submitted',
        changed_by=user_id,
        changed_at=datetime.utcnow(),
    )
    db.session.add(history)
    db.session.commit()

    return jsonify({
        'revision': revision.to_dict(),
        'work_order': order.to_dict(include_project_data=True),
    }), 201


@work_orders_bp.route('/api/work-orders/<int:order_id>/approve', methods=['PUT'])
@login_required
def approve_work_order(order_id):
    """Customer approves the current design."""
    user_id = g.user_id
    order = WorkOrder.query.filter_by(id=order_id, user_id=user_id).first()
    if not order:
        return jsonify({'error': 'Work order not found.'}), 404

    old_status = order.status
    order.status = 'Approved'

    history = WorkOrderStatusHistory(
        work_order_id=order_id,
        from_status=old_status if isinstance(old_status, str) else str(old_status),
        to_status='Approved',
        changed_by=user_id,
        changed_at=datetime.utcnow(),
    )
    db.session.add(history)
    db.session.commit()

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


# ── Admin revision endpoints ──────────────────────────────────────

@admin_work_orders_bp.route('/api/admin/work-orders/<int:order_id>', methods=['GET'])
@admin_required
def admin_get_work_order(order_id):
    """Admin: get single work order with project data & template."""
    order = WorkOrder.query.get(order_id)
    if not order:
        return jsonify({'error': 'Work order not found.'}), 404
    return jsonify({
        'work_order': order.to_dict(include_admin_notes=True, include_project_data=True)
    }), 200


@admin_work_orders_bp.route('/api/admin/work-orders/<int:order_id>/revisions', methods=['GET'])
@admin_required
def admin_list_revisions(order_id):
    """Admin: list all revisions for a work order."""
    order = WorkOrder.query.get(order_id)
    if not order:
        return jsonify({'error': 'Work order not found.'}), 404
    revisions = (
        WorkOrderRevision.query
        .filter_by(work_order_id=order_id)
        .order_by(WorkOrderRevision.revision_number.asc())
        .all()
    )
    return jsonify({'revisions': [r.to_dict() for r in revisions]}), 200


@admin_work_orders_bp.route('/api/admin/work-orders/<int:order_id>/revisions', methods=['POST'])
@admin_required
def admin_create_revision(order_id):
    """Admin creates a new revision and optionally sends for customer review."""
    order = WorkOrder.query.get(order_id)
    if not order:
        return jsonify({'error': 'Work order not found.'}), 404

    data = request.get_json() or {}
    design_data = data.get('design_data')
    if not isinstance(design_data, dict):
        return jsonify({'error': 'design_data must be a JSON object'}), 400

    send_for_review = data.get('send_for_review', False)

    # Determine next revision number
    max_rev = (
        db.session.query(db.func.max(WorkOrderRevision.revision_number))
        .filter_by(work_order_id=order_id)
        .scalar()
    ) or 0

    revision = WorkOrderRevision(
        work_order_id=order_id,
        revision_number=max_rev + 1,
        author_type='admin',
        author_id=g.user_id,
        design_data=design_data,
        notes=data.get('notes'),
    )
    db.session.add(revision)

    # Update the project's design_data to match latest revision
    if order.project:
        order.project.design_data = design_data

    # Update status if sending for customer review
    if send_for_review:
        old_status = order.status
        order.status = 'Revision Requested'
        history = WorkOrderStatusHistory(
            work_order_id=order_id,
            from_status=old_status if isinstance(old_status, str) else str(old_status),
            to_status='Revision Requested',
            changed_by=g.user_id,
            changed_at=datetime.utcnow(),
        )
        db.session.add(history)

    db.session.commit()

    return jsonify({
        'revision': revision.to_dict(),
        'work_order': order.to_dict(include_admin_notes=True, include_project_data=True),
    }), 201


@admin_work_orders_bp.route('/api/admin/customers/<int:customer_id>/template-message', methods=['POST'])
@admin_required
def admin_send_template_to_customer(customer_id):
    customer = fetch_customer_by_id(customer_id)
    if not customer:
        return jsonify({'error': 'Customer not found.'}), 404

    payload = request.get_json(silent=True) or {}
    template_id = payload.get('template_id')
    message = (payload.get('message') or '').strip()

    if not template_id:
        return jsonify({'error': 'template_id is required.'}), 400

    template = Template.query.get(template_id)
    if not template or not template.is_active:
        return jsonify({'error': 'Template not found.'}), 404

    is_direct_message = (template.category or '').strip().lower() == 'direct message'
    if template.is_private and template.assigned_customer_id and int(template.assigned_customer_id) != int(customer_id):
        return jsonify({'error': 'template_assigned_to_another_customer'}), 400
    if is_direct_message or template.is_private:
        template.is_private = True
        if not template.assigned_customer_id:
            template.assigned_customer_id = customer_id
        if int(template.assigned_customer_id) != int(customer_id):
            return jsonify({'error': 'template_assigned_to_another_customer'}), 400

    project_name = (payload.get('project_name') or '').strip() or f"{template.name} - Admin Draft"
    design_data = payload.get('design_data') if isinstance(payload.get('design_data'), dict) else {}

    try:
        project = UserProject(
            user_id=customer_id,
            template_id=template.id,
            name=project_name,
            design_data=design_data,
        )
        db.session.add(project)
        db.session.flush()

        work_order = WorkOrder(
            work_order_number=generate_work_order_number(db.session),
            project_id=project.id,
            user_id=customer_id,
            status='Pending Review',
            customer_notes=message or f'New template sent by admin: {template.name}',
            admin_notes=f'Admin template sent by {g.user_id}',
        )
        db.session.add(work_order)
        db.session.flush()

        history = WorkOrderStatusHistory(
            work_order_id=work_order.id,
            from_status=None,
            to_status='Pending Review',
            changed_by=g.user_id,
            changed_at=datetime.utcnow(),
        )
        db.session.add(history)
        db.session.commit()

        return jsonify({
            'message': 'Template sent to customer work orders.',
            'work_order': work_order.to_dict(include_admin_notes=True, include_project_data=True),
        }), 201
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'failed_to_send_template'}), 500
